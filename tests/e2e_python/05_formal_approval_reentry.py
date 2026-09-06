"""Documents the required policy: negotiated final exceptions must re-enter approval."""

from common import ask_for_discount, prepare_initial_offer, request, revise


if __name__ == "__main__":
    print("Scenario: negotiated final exception re-enters the formal approval queue")
    flow = prepare_initial_offer("FormalApproval")
    ask_for_discount(flow, 5)
    revise(flow, "manager", 5, "Manager accepted the negotiated exception pending formal approval.")
    approvals = request("GET", "/manager/approvals", token=flow["auth"]["manager"])["approvals"]
    matches = [item for item in approvals if item["quotation_id"] == flow["quote_id"] and item["status"] == "pending"]
    if not matches:
        raise AssertionError("No formal approval was created for the negotiated final quote.")
    print("PASS: formal approval queue contains the negotiated exception")
