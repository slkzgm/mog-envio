import assert from "assert";
import { 
  TestHelpers,
  ClaimVault_JackpotClaimed
} from "generated";
const { MockDb, ClaimVault } = TestHelpers;

describe("ClaimVault contract JackpotClaimed event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for ClaimVault contract JackpotClaimed event
  const event = ClaimVault.JackpotClaimed.createMockEvent({/* It mocks event fields with default values. You can overwrite them if you need */});

  it("ClaimVault_JackpotClaimed is created correctly", async () => {
    // Processing the event
    const mockDbUpdated = await ClaimVault.JackpotClaimed.processEvent({
      event,
      mockDb,
    });

    // Getting the actual entity from the mock database
    let actualClaimVaultJackpotClaimed = mockDbUpdated.entities.ClaimVault_JackpotClaimed.get(
      `${event.chainId}_${event.block.number}_${event.logIndex}`
    );

    // Creating the expected entity
    const expectedClaimVaultJackpotClaimed: ClaimVault_JackpotClaimed = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      claimer: event.params.claimer,
      nonce: event.params.nonce,
      amount: event.params.amount,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    assert.deepEqual(actualClaimVaultJackpotClaimed, expectedClaimVaultJackpotClaimed, "Actual ClaimVaultJackpotClaimed should be the same as the expectedClaimVaultJackpotClaimed");
  });
});
