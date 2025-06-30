import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract owner can add authorities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify authority was added
        let authorityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-authority', [
            types.principal(authority1.address)
        ], deployer.address);
        assertEquals(authorityCheck.result, types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that non-owner cannot add authorities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get('wallet_1')!;
        let wallet2 = accounts.get('wallet_2')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet2.address),
                types.utf8("Unauthorized Authority")
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that adding duplicate authority fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Try to add same authority again
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("Another Department")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that contract owner can remove authorities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        
        // Add authority first
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Remove authority
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'remove-authority', [
                types.principal(authority1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify authority was deactivated
        let authorityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-authority', [
            types.principal(authority1.address)
        ], deployer.address);
        assertEquals(authorityCheck.result, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that removing non-existent authority fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'remove-authority', [
                types.principal(wallet1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure that authorized authority can issue passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority first
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Issue passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000), // January 1, 1990
                types.utf8("United States"),
                types.uint(525600), // ~1 year validity
                types.some(types.utf8("https://metadata.example.com/passport/US123456789"))
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify passport was created
        let passportCall = chain.callReadOnlyFn('blockchain_passport', 'get-passport', [
            types.utf8("US123456789")
        ], authority1.address);
        let passport = passportCall.result.expectSome().expectTuple();
        assertEquals(passport['holder'], holder1.address);
        assertEquals(passport['full-name'], types.utf8("John Smith"));
        assertEquals(passport['nationality'], types.utf8("United States"));
        assertEquals(passport['is-valid'], types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that non-authority cannot issue passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that duplicate passport numbers cannot be issued",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        let holder2 = accounts.get('wallet_3')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Issue first passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        // Try to issue passport with same number
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"), // Same passport number
                types.principal(holder2.address),
                types.utf8("Jane Doe"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that holder cannot have multiple passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Issue first passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        // Try to issue another passport to same holder
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US987654321"), // Different passport number
                types.principal(holder1.address), // Same holder
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that passport validity can be checked correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600), // Long validity period
                types.none()
            ], authority1.address)
        ]);
        
        // Check passport validity
        let validityCall = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("US123456789")
        ], authority1.address);
        assertEquals(validityCall.result, types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that authority can revoke passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        // Revoke passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("US123456789")
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Check passport is no longer valid
        let validityCall = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("US123456789")
        ], authority1.address);
        assertEquals(validityCall.result, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that non-authority cannot revoke passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        let wallet3 = accounts.get('wallet_3')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        // Try to revoke passport from non-authority
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("US123456789")
            ], wallet3.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that passport metadata can be updated",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.some(types.utf8("https://old-metadata.example.com"))
            ], authority1.address)
        ]);
        
        // Update metadata
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'update-passport-metadata', [
                types.utf8("US123456789"),
                types.some(types.utf8("https://new-metadata.example.com"))
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify metadata was updated
        let passportCall = chain.callReadOnlyFn('blockchain_passport', 'get-passport', [
            types.utf8("US123456789")
        ], authority1.address);
        let passport = passportCall.result.expectSome().expectTuple();
        assertEquals(passport['metadata-url'], types.some(types.utf8("https://new-metadata.example.com")));
    },
});

Clarinet.test({
    name: "Ensure that passport validity can be extended",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600), // 1 year
                types.none()
            ], authority1.address)
        ]);
        
        // Get original expiry date
        let passportCall = chain.callReadOnlyFn('blockchain_passport', 'get-passport', [
            types.utf8("US123456789")
        ], authority1.address);
        let originalPassport = passportCall.result.expectSome().expectTuple();
        let originalExpiry = originalPassport['expiry-date'];
        
        // Extend validity
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'extend-passport-validity', [
                types.utf8("US123456789"),
                types.uint(262800) // 6 months extension
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify expiry date was extended
        passportCall = chain.callReadOnlyFn('blockchain_passport', 'get-passport', [
            types.utf8("US123456789")
        ], authority1.address);
        let updatedPassport = passportCall.result.expectSome().expectTuple();
        let newExpiry = updatedPassport['expiry-date'];
        
        // New expiry should be later than original
        assertEquals(newExpiry > originalExpiry, true);
    },
});

Clarinet.test({
    name: "Ensure that holder passport lookup works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.none()
            ], authority1.address)
        ]);
        
        // Check holder passport lookup
        let holderPassportCall = chain.callReadOnlyFn('blockchain_passport', 'get-holder-passport', [
            types.principal(holder1.address)
        ], authority1.address);
        assertEquals(holderPassportCall.result.expectSome(), types.utf8("US123456789"));
    },
});

Clarinet.test({
    name: "Ensure that operations on non-existent passports fail",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address)
        ]);
        
        // Try to revoke non-existent passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("NONEXISTENT123")
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
        
        // Try to update metadata of non-existent passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'update-passport-metadata', [
                types.utf8("NONEXISTENT123"),
                types.some(types.utf8("https://metadata.example.com"))
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
        
        // Try to extend validity of non-existent passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'extend-passport-validity', [
                types.utf8("NONEXISTENT123"),
                types.uint(262800)
            ], authority1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure that expired passports are marked as invalid",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let holder1 = accounts.get('wallet_2')!;
        
        // Add authority and issue passport with very short validity
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(1), // Very short validity (1 block)
                types.none()
            ], authority1.address)
        ]);
        
        // Initially valid
        let validityCall = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("US123456789")
        ], authority1.address);
        assertEquals(validityCall.result, types.bool(true));
        
        // Mine some blocks to expire the passport
        chain.mineBlock([]);
        chain.mineBlock([]);
        
        // Now should be invalid due to expiry
        validityCall = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("US123456789")
        ], authority1.address);
        assertEquals(validityCall.result, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that complete passport workflow works end-to-end",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority1 = accounts.get('wallet_1')!;
        let authority2 = accounts.get('wallet_2')!;
        let holder1 = accounts.get('wallet_3')!;
        let holder2 = accounts.get('wallet_4')!;
        
        // Add multiple authorities
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority1.address),
                types.utf8("US Department of State")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority2.address),
                types.utf8("UK Passport Office")
            ], deployer.address)
        ]);
        
        // Issue passports from different authorities
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("US123456789"),
                types.principal(holder1.address),
                types.utf8("John Smith"),
                types.uint(631152000),
                types.utf8("United States"),
                types.uint(525600),
                types.some(types.utf8("https://us.passports.gov/metadata/US123456789"))
            ], authority1.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("GB987654321"),
                types.principal(holder2.address),
                types.utf8("Jane Doe"),
                types.uint(631152000),
                types.utf8("United Kingdom"),
                types.uint(525600),
                types.some(types.utf8("https://uk.passports.gov/metadata/GB987654321"))
            ], authority2.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk(), types.bool(true));
        
        // Verify both passports are valid
        let validity1 = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("US123456789")
        ], authority1.address);
        let validity2 = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', [
            types.utf8("GB987654321")
        ], authority2.address);
        
        assertEquals(validity1.result, types.bool(true));
        assertEquals(validity2.result, types.bool(true));
        
        // Update metadata and extend validity
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'update-passport-metadata', [
                types.utf8("US123456789"),
                types.some(types.utf8("https://updated.us.passports.gov/US123456789"))
            ], authority1.address),
            Tx.contractCall('blockchain_passport', 'extend-passport-validity', [
                types.utf8("GB987654321"),
                types.uint(262800) // 6 months extension
            ], authority2.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk(), types.bool(true));
        
        // Verify holder lookups
        let holder1Passport = chain.callReadOnlyFn('blockchain_passport', 'get-holder-passport', [
            types.principal(holder1.address)
        ], deployer.address);
        let holder2Passport = chain.callReadOnlyFn('blockchain_passport', 'get-holder-passport', [
            types.principal(holder2.address)
        ], deployer.address);
        
        assertEquals(holder1Passport.result.expectSome(), types.utf8("US123456789"));
        assertEquals(holder2Passport.result.expectSome(), types.utf8("GB987654321"));
    },
});