"""Minimal dependency-free helpers for live DealFlow360 workflow tests."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
import uuid


BASE_URL = os.environ.get("DF360_API_URL", "http://localhost:3001/api/v1").rstrip("/")
SEED_PASSWORD = os.environ.get("DF360_SEED_PASSWORD", "ChangeMe123!")


class ApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, body: object):
        super().__init__(f"{method} {path} returned {status}: {body}")
        self.status = status
        self.body = body


def request(method: str, path: str, payload: dict | None = None, token: str | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = raw
        raise ApiError(method, path, error.code, body) from error


def expect(actual: object, expected: object, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")
    print(f"  PASS  {label}: {expected}")


def login(email: str) -> str:
    response = request("POST", "/auth/login", {"email": email, "password": SEED_PASSWORD})
    return response["data"]["accessToken"]


def roles() -> dict[str, str]:
    return {
        "admin": login("admin@dealflow360.local"),
        "rep": login("rep@dealflow360.local"),
        "manager": login("manager@dealflow360.local"),
        "finance": login("finance@dealflow360.local"),
    }


def new_customer(label: str) -> dict:
    suffix = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
    email = f"e2e-{label.lower()}-{suffix}@example.test"
    name = f"E2E {label} {suffix}"
    response = request("POST", "/auth/customer-signup", {
        "email": email,
        "password": "E2eCustomer!123",
        "displayName": name,
    })
    return {"email": email, "name": name, "token": response["data"]["accessToken"]}


def customer_id(admin_token: str, name: str) -> str:
    customers = request("GET", "/admin/customers", token=admin_token)["data"]
    matches = [customer for customer in customers if customer["legal_name"] == name]
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one customer named {name!r}, found {len(matches)}")
    return matches[0]["id"]


def prepare_initial_offer(label: str, discount: float = 0) -> dict:
    """Customer asks for a quote; Sales Rep creates and sends an initial offer."""
    auth = roles()
    customer = new_customer(label)
    quote_request = request("POST", "/portal/quote-requests", {
        "message": f"Please quote the standard {label} package."
    }, customer["token"])["request"]
    internal_users = request("GET", "/admin/users", token=auth["admin"])["data"]
    assignees = [
        user for user in internal_users
        if user["id"] == quote_request["assigned_sales_rep_id"] and "sales_rep" in user["roles"]
    ]
    if len(assignees) != 1:
        raise AssertionError("Customer quote request was not assigned to an active Sales Rep")
    print(f"  PASS  customer request assigned to Sales Rep ({assignees[0]['email']})")

    product = request("GET", "/sales-rep/quotations/meta/products", token=auth["rep"])["data"][0]
    created = request("POST", "/sales-rep/quotations", {
        "customerId": customer_id(auth["admin"], customer["name"]),
        "currencyCode": "USD",
        "discountMode": "line",
        "lines": [{"productId": product["id"], "quantity": 1, "lineDiscountPercent": discount}],
        "reason": f"E2E initial offer: {label}",
    }, auth["rep"])["data"]
    quote_id = created["quote"]["id"]
    sent = request("POST", f"/sales-rep/quotations/{quote_id}/submit", {}, auth["rep"])["data"]
    expect(sent["status"], "sent_to_customer", "initial offer is sent to customer")
    return {"auth": auth, "customer": customer, "quote_id": quote_id, "product": product}


def portal_quote(flow: dict) -> dict:
    return request("GET", f"/portal/quotes/{flow['quote_id']}", token=flow["customer"]["token"])["quote"]


def accept(flow: dict) -> None:
    quote = portal_quote(flow)
    response = request("POST", f"/portal/quotes/{flow['quote_id']}/accept", {
        "lock_version": quote["lock_version"]
    }, flow["customer"]["token"])
    expect(response["status"], "customer_confirmed", "customer closes the deal")
    expect(portal_quote(flow)["status"], "customer_confirmed", "portal persists the closed state")


def ask_for_discount(flow: dict, discount: float) -> None:
    quote = portal_quote(flow)
    line = quote["version"]["lines"][0]
    response = request("POST", f"/portal/quotes/{flow['quote_id']}/negotiation-requests", {
        "lock_version": quote["lock_version"],
        "counter_discount_percent": discount,
        "line_requests": [{"line_id": line["id"], "comment": f"Please approve {discount}% discount."}],
    }, flow["customer"]["token"])
    expect(response["request"]["status"], "under_negotiation", "customer request opens negotiation")


def case_for(flow: dict, role: str) -> dict:
    cases = request("GET", "/negotiations", token=flow["auth"][role])["cases"]
    matches = [item for item in cases if item["quotation_id"] == flow["quote_id"]]
    if len(matches) != 1:
        raise AssertionError(f"Expected one {role} queue entry for quote {flow['quote_id']}, found {len(matches)}")
    return matches[0]


def revise(flow: dict, role: str, discount: float, reason: str) -> None:
    detail = request("GET", f"/negotiations/{flow['quote_id']}", token=flow["auth"][role])
    if not detail["can_edit"]:
        raise AssertionError(f"{role} cannot edit its assigned negotiation")
    lines = [
        {"productId": line["product_id"], "quantity": float(line["quantity"]), "lineDiscountPercent": discount}
        for line in detail["quotation"]["version"]["lines"]
    ]
    response = request("POST", f"/negotiations/{flow['quote_id']}/revisions", {
        "expectedLockVersion": detail["quotation"]["lock_version"],
        "currencyCode": detail["quotation"]["version"]["currency_code"],
        "discountMode": "line",
        "lines": lines,
        "reason": reason,
    }, flow["auth"][role])
    expect(response["data"]["status"], "sent_to_customer", f"{role} revised offer is sent to customer")


def forward_to_finance(flow: dict) -> None:
    response = request("POST", f"/negotiations/{flow['quote_id']}/forward-to-finance", {
        "reason": "Commercial exception needs finance review."
    }, flow["auth"]["manager"])
    expect(response["data"]["owner_role"], "finance_operations", "Manager forwards case to Finance")
