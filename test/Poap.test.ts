import { ethers } from "hardhat";
import { expect } from "chai";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { KoPOAP } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { encodePacked } from "viem";

// Extract role constants
const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("DOH POAP", () => {
    let poap: KoPOAP;
    let owner: SignerWithAddress;
    let attendees: SignerWithAddress[];
    let lectureName: string;
    let deadline: bigint;
    let start: bigint;
    let tokenURI: string;
    let lectureHash: string;

    // Fixture for deploying the contract before each test
    async function deployPoapFixture() {
        const [owner, pauser, minter, ...attendees] = await ethers.getSigners();

        const KoPOAP = await ethers.getContractFactory("DeepOceanHousePOAP");
        const poap = await KoPOAP.deploy(
            "Deep Ocean House POAP", // name
            "DOHPOAP", // symbol
            owner.address,
            owner.address,
            owner.address
        );

        return { poap, owner, pauser, minter, attendees };
    }

    beforeEach(async () => {
        ({ poap, owner, attendees } = await deployPoapFixture());
        
        // Setup for lecture creation
        lectureName = "Test Lecture";
        deadline = BigInt(await time.latest()) + BigInt(86400); // 1 day from now
        start = BigInt(await time.latest())
        tokenURI = "ipfs://test-uri/";
        
        // Calculate the expected lecture hash
        lectureHash = ethers.keccak256(
            encodePacked(
                ["string", "uint256", "string"],
                [lectureName, deadline, tokenURI]
            )
        );
    });

    describe("Deployment", () => {
        it("Should set the correct roles", async () => {
            expect(await poap.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await poap.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
            expect(await poap.hasRole(MINTER_ROLE, owner.address)).to.be.true;
        });
    });

    describe("Lecture Creation", () => {
        it("Should allow minter to create a lecture", async () => {
            const tx = await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);

            // Check lecture was created and added to counter
            expect(await poap.getLectureCount()).to.equal(1);

            // Verify event was emitted with correct hash
            await expect(tx)
                .to.emit(poap, "LectureCreated")
                .withArgs(lectureHash, lectureName, start, deadline, tokenURI);
        });

        it("Should revert if non-minter tries to create a lecture", async () => {
            await expect(
                poap.connect(attendees[0]).createLecture("Unauthorized", start, deadline, "uri")
            ).to.be.revertedWithCustomError(poap, "AccessControlUnauthorizedAccount");
        });

        it("Should revert lecture creation when paused", async () => {
            await poap.connect(owner).pause();

            await expect(
                poap.connect(owner).createLecture("While Paused", start, deadline, "uri")
            ).to.be.revertedWithCustomError(poap, "EnforcedPause");
        });
        
        it("Should revert if lecture already exists", async () => {
            // Create a lecture first
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);
            
            // Try to create the same lecture again
            await expect(
                poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI)
            ).to.be.revertedWith("Lecture already exists");
        });
    });

    describe("Minting POAPs", () => {
        beforeEach(async () => {
            // Create a lecture for tests
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);
        });

        it("Should allow owner to mint a POAP", async () => {
            const attendee = attendees[0];
            
            // Mint and get the token ID
            const tx = await poap.connect(owner).mintPOAP(lectureHash, attendee.address);
            const receipt = await tx.wait();
            
            // Find the POAPClaimed event to get the tokenId
            const event = receipt?.logs.find(
                log => log.topics[0] === ethers.id('POAPClaimed(bytes32,address,uint256)')
            );
            if (!event) {
                throw new Error("POAPClaimed event not found");
            }
            const parsedEvent = poap.interface.parseLog(event);
            if (!parsedEvent) {
                throw new Error("Failed to parse event");
            }
            const tokenId = parsedEvent.args[2];
            
            // Verify event was emitted
            await expect(tx)
                .to.emit(poap, "POAPClaimed")
                .withArgs(lectureHash, attendee.address, tokenId);
            
            // Check claimed status
            expect(await poap.hasClaimed(lectureHash, attendee.address)).to.be.eq(1n);
            
            // Check token is in owner's tokens list
            const ownerTokens = await poap.getTokensOfOwner(attendee.address);
            expect(ownerTokens).to.include(tokenId);
        });

        it("Should revert minting for invalid lecture hash", async () => {
            const invalidHash = ethers.keccak256(ethers.toUtf8Bytes("invalid"));

            await expect(
                poap.connect(owner).mintPOAP(invalidHash, attendees[0].address)
            ).to.be.revertedWith("Invalid lecture ID");
        });

        it("Should revert minting if deadline passed", async () => {
            // Create a lecture with past deadline
            const pastDeadline = BigInt(await time.latest()) - BigInt(1);
            const pastLectureName = "Past Lecture";
            const pastLectureURI = "past-uri";
            
            const pastLectureHash = ethers.keccak256(
                encodePacked(
                    ["string", "uint256", "string"],
                    [pastLectureName, pastDeadline, pastLectureURI]
                )
            );
            
            await poap.connect(owner).createLecture(pastLectureName, start, pastDeadline, pastLectureURI);
            
            // Try to mint
            await expect(
                poap.connect(owner).mintPOAP(pastLectureHash, attendees[0].address)
            ).to.be.revertedWith("Lecture is not active");
        });

        it("Should revert minting if already claimed", async () => {
            const attendee = attendees[0];

            // Mint once
            await poap.connect(owner).mintPOAP(lectureHash, attendee.address);

            // Try to mint again
            await expect(
                poap.connect(owner).mintPOAP(lectureHash, attendee.address)
            ).to.be.revertedWith("POAP already claimed");
        });

        it("Should revert if non-owner tries to mint", async () => {
            await expect(
                poap.connect(attendees[0]).mintPOAP(lectureHash, attendees[1].address)
            ).to.be.revertedWithCustomError(poap, "AccessControlUnauthorizedAccount");
        });

        it("Should revert minting when paused", async () => {
            await poap.connect(owner).pause();

            await expect(
                poap.connect(owner).mintPOAP(lectureHash, attendees[0].address)
            ).to.be.revertedWithCustomError(poap, "EnforcedPause");
        });
    });

    describe("Batch Minting POAPs", () => {
        beforeEach(async () => {
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);
        });

        it("Should mint POAPs to multiple attendees", async () => {
            const batchAttendees = attendees.slice(0, 3).map(a => a.address);

            await poap.connect(owner).batchMintPOAP(lectureHash, batchAttendees);

            // Check claimed status for all attendees
            for (let i = 0; i < batchAttendees.length; i++) {
                expect(await poap.hasClaimed(lectureHash, batchAttendees[i])).to.be.gt(0n);
            }
        });

        it("Should skip already claimed POAPs in batch mint", async () => {
            // Pre-mint to first attendee
            const firstMintTx = await poap.connect(owner).mintPOAP(lectureHash, attendees[0].address);
            const firstReceipt = await firstMintTx.wait();
            
            // Get first token ID
            let firstTokenId;
            for (const log of firstReceipt.logs) {
                try {
                    const parsedLog = poap.interface.parseLog({
                        topics: log.topics as string[],
                        data: log.data
                    });
                    if (parsedLog && parsedLog.name === 'POAPClaimed') {
                        firstTokenId = parsedLog.args[2];
                        break;
                    }
                } catch (e) {
                    // Skip logs that can't be parsed
                }
            }

            // Batch mint including the first attendee again
            const batchAttendees = attendees.slice(0, 3).map(a => a.address);
            await poap.connect(owner).batchMintPOAP(lectureHash, batchAttendees);

            // Verify all have claimed
            for (let i = 0; i < batchAttendees.length; i++) {
                expect(await poap.hasClaimed(lectureHash, batchAttendees[i])).to.be.gt(0n);
            }
        });

        it("Should revert batch minting for invalid lecture hash", async () => {
            const invalidHash = ethers.keccak256(ethers.toUtf8Bytes("invalid"));

            await expect(
                poap.connect(owner).batchMintPOAP(invalidHash, [attendees[0].address])
            ).to.be.revertedWith("Lecture is not active or invalid");
        });

        it("Should revert batch minting if deadline passed", async () => {
            // Create a lecture with past deadline
            const pastDeadline = BigInt(await time.latest()) - BigInt(1);
            const pastLectureName = "Past Lecture";
            const pastLectureURI = "past-uri";
            
            const pastLectureHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["string", "uint256", "string"],
                    [pastLectureName, pastDeadline, pastLectureURI]
                )
            );
            
            await poap.connect(owner).createLecture(pastLectureName, start, pastDeadline, pastLectureURI);

            await expect(
                poap.connect(owner).batchMintPOAP(pastLectureHash, [attendees[0].address])
            ).to.be.revertedWith("Lecture is not active or invalid");
        });

        it("Should handle empty array of attendees", async () => {
            await poap.connect(owner).batchMintPOAP(lectureHash, []);
            // Should complete without errors
        });

        it("Should revert if non-owner tries to batch mint", async () => {
            await expect(
                poap.connect(attendees[0]).batchMintPOAP(lectureHash, [attendees[1].address])
            ).to.be.revertedWithCustomError(poap, "AccessControlUnauthorizedAccount");
        });

        it("Should revert batch minting when paused", async () => {
            await poap.connect(owner).pause();

            await expect(
                poap.connect(owner).batchMintPOAP(lectureHash, [attendees[0].address])
            ).to.be.revertedWithCustomError(poap, "EnforcedPause");
        });
    });

    describe("Token URI", () => {
        let firstTokenId: bigint;

        beforeEach(async () => {
            // Create a lecture
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);
            
            // Mint a token to test URI
            const tx = await poap.connect(owner).mintPOAP(lectureHash, attendees[0].address);
            const receipt = await tx.wait();
            
            // Find the POAPClaimed event to get the tokenId
            for (const log of receipt!.logs) {
                try {
                    const parsedLog = poap.interface.parseLog({
                        topics: log.topics as string[],
                        data: log.data
                    });
                    if (parsedLog && parsedLog.name === 'POAPClaimed') {
                        firstTokenId = parsedLog.args[2];
                        break;
                    }
                } catch (e) {
                    console.error("Failed to parse log:", e);
                    // Skip logs that can't be parsed
                }
            }
        });

        it("Should return correct token URI", async () => {
            expect(await poap.tokenURI(firstTokenId)).to.equal(tokenURI);
        });
    });
    
    describe("Lecture Queries", () => {
        beforeEach(async () => {
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);
        });

        it("Should return correct lecture count", async () => {
            expect(await poap.getLectureCount()).to.equal(1);

            // Add another lecture
            await poap.connect(owner).createLecture("Another Lecture", start, deadline, "uri2");

            expect(await poap.getLectureCount()).to.equal(2);
            expect((await poap.getLecture(0))[0]).to.equal(lectureHash);
        });

        it("Should return correct claimed status", async () => {
            const attendee = attendees[0];

            // Not claimed initially
            expect(await poap.hasClaimed(lectureHash, attendee.address)).to.be.equal(0n);

            // Mint a POAP
            await poap.connect(owner).mintPOAP(lectureHash, attendee.address);

            // Should be claimed now
            expect(await poap.hasClaimed(lectureHash, attendee.address)).to.be.equal(1n);
        });
    });

    describe("Pausing", () => {
        it("Should allow owner to pause the contract", async () => {
            await poap.connect(owner).pause();
            expect(await poap.paused()).to.be.true;
        });

        it("Should allow owner to unpause the contract", async () => {
            await poap.connect(owner).pause();
            await poap.connect(owner).unpause();
            expect(await poap.paused()).to.be.false;
        });

        it("Should revert if non-owner tries to pause", async () => {
            await expect(
                poap.connect(attendees[0]).pause()
            ).to.be.revertedWithCustomError(poap, "AccessControlUnauthorizedAccount");
        });

        it("Should revert if non-owner tries to unpause", async () => {
            await poap.connect(owner).pause();

            await expect(
                poap.connect(attendees[0]).unpause()
            ).to.be.revertedWithCustomError(poap, "AccessControlUnauthorizedAccount");
        });

        it("Should prevent minting when paused", async () => {
            // Create a lecture
            await poap.connect(owner).createLecture(lectureName, start, deadline, tokenURI);

            // Pause contract
            await poap.connect(owner).pause();

            // Try to mint POAP
            await expect(
                poap.connect(owner).mintPOAP(lectureHash, attendees[0].address)
            ).to.be.revertedWithCustomError(poap, "EnforcedPause");
        });
    });

    describe("Interface Support", () => {
        it("Should support ERC721 interface", async () => {
            const ERC721InterfaceId = "0x80ac58cd";
            expect(await poap.supportsInterface(ERC721InterfaceId)).to.be.true;
        });

        it("Should support AccessControl interface", async () => {
            const AccessControlInterfaceId = "0x7965db0b";
            expect(await poap.supportsInterface(AccessControlInterfaceId)).to.be.true;
        });
    });
});
