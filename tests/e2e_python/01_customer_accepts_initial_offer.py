from common import accept, prepare_initial_offer


if __name__ == "__main__":
    print("Scenario: Customer -> Sales Rep -> customer acceptance")
    accept(prepare_initial_offer("InitialOffer"))
    print("PASS: initial-offer flow completed")
