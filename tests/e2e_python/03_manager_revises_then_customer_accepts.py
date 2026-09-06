from common import accept, approve_and_send, ask_for_discount, case_for, expect, prepare_initial_offer, revise


if __name__ == "__main__":
    print("Scenario: Customer -> Sales Rep -> Manager revised offer -> customer acceptance")
    flow = prepare_initial_offer("ManagerRevision")
    ask_for_discount(flow, 5)
    expect(case_for(flow, "manager")["owner_role"], "sales_manager", "Manager owns the requested change")
    revise(flow, "manager", 2, "Manager offered a revised 2% discount.")
    approve_and_send(flow, "manager")
    accept(flow)
    print("PASS: Manager revision flow completed")
