from common import accept, approve_and_send, ask_for_discount, case_for, expect, prepare_initial_offer, revise


if __name__ == "__main__":
    print("Scenario: Customer -> Sales Rep -> Manager -> customer acceptance")
    flow = prepare_initial_offer("ManagerSameTerms")
    ask_for_discount(flow, 1)
    manager_case = case_for(flow, "manager")
    expect(manager_case["owner_role"], "sales_manager", "Manager owns the negotiation")
    revise(flow, "manager", 1, "Manager accepted the customer's requested discount.")
    approve_and_send(flow, "manager")
    accept(flow)
    print("PASS: Manager accepted customer terms and deal closed")
