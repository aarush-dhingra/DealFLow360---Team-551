from common import accept, approve_and_send, ask_for_discount, case_for, expect, forward_to_finance, prepare_initial_offer, revise


if __name__ == "__main__":
    print("Scenario: Customer -> Sales Rep -> Manager -> Finance -> customer acceptance")
    flow = prepare_initial_offer("FinanceRevision")
    ask_for_discount(flow, 10)
    expect(case_for(flow, "manager")["owner_role"], "sales_manager", "Manager receives the high-risk request")
    forward_to_finance(flow)
    finance_case = case_for(flow, "finance")
    expect(finance_case["owner_role"], "finance_operations", "Finance receives the forwarded negotiation")
    manager_history = case_for(flow, "manager")
    expect(manager_history["owner_role"], "finance_operations", "Manager retains forwarded-to-Finance history")
    revise(flow, "finance", 3, "Finance approved a final 3% concession.")
    approve_and_send(flow, "finance")
    accept(flow)
    print("PASS: Finance revision flow completed")
