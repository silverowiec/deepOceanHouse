import { ethers } from "hardhat";

async function main() {
  try {
    console.log("Batch minting POAPs for existing lecture...");

    // Get the signer account
    const [deployer] = await ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);

    // Contract address - Should match your deployed contract
    const CONTRACT_ADDRESS = "0xeE90454E72268dAA1b6f1174258d26e55bD8DBB4";
    
    // LECTURE HASH - UPDATE THIS with the hash of the lecture you want to mint POAPs for
      const LECTURE_HASH = "0xc12a07247e4188e82ea3c79fc63cc58fe92575672661ad664776fa13e7a640ca";
    
    if (LECTURE_HASH === "YOUR_LECTURE_HASH_HERE") {
      console.error("❌ Please update LECTURE_HASH with the hash of your existing lecture");
      console.log("You can find the lecture hash from the previous script output or by calling getLectureDetails()");
      process.exit(1);
    }

    // List of NEW addresses to mint POAPs to - ADD YOUR NEW ADDRESSES HERE
    const newAttendeeAddresses = [
      "0x09d7b008cb910Ae813615883950475e2FD4668Fa",
      "0x0b8d29dc2912030d681C4D78Ae7CDe59fC7B55bE",
      "0xFd8161d7Dd9470949d43B2F20e74A85c5c50db63",
    ];

    // Remove placeholder addresses and validate
    const validAddresses = newAttendeeAddresses.filter(addr => 
      addr && 
      addr !== "YOUR_ADDRESS_HERE" && 
      ethers.isAddress(addr)
    );

    if (validAddresses.length === 0) {
      console.error("❌ No valid addresses found. Please update the newAttendeeAddresses array.");
      console.log("Example addresses should be in format: '0x1234567890123456789012345678901234567890'");
      process.exit(1);
    }

    // Validate all addresses
    const invalidAddresses = validAddresses.filter(addr => !ethers.isAddress(addr));
    if (invalidAddresses.length > 0) {
      console.error("❌ Invalid addresses found:", invalidAddresses);
      process.exit(1);
    }

    console.log(`Found ${validAddresses.length} valid addresses to mint POAPs to`);

    // Connect to the deployed contract
    const DOH = await ethers.getContractFactory("DeepOceanHousePOAP");
    const poap = DOH.attach(CONTRACT_ADDRESS) as any;

    // Verify contract connection
    const contractName = await poap.name();
    console.log(`Connected to contract: ${contractName}`);

    // Check if deployer has MINTER_ROLE
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const hasMinterRole = await poap.hasRole(MINTER_ROLE, deployer.address);
    
    if (!hasMinterRole) {
      console.error("❌ Deployer does not have MINTER_ROLE");
      process.exit(1);
    }

    console.log("✅ Deployer has MINTER_ROLE");

    // Check which addresses have already claimed POAPs
    console.log("\n🔍 Checking existing claims...");
    const addressesToMint: string[] = [];
    const alreadyClaimed: string[] = [];

    for (const address of validAddresses) {
      const claimed = await poap.hasClaimed(LECTURE_HASH, address);
      if (Number(claimed) > 0) {
        alreadyClaimed.push(address);
        console.log(`⚠️  ${address} - Already claimed (Token ID: ${claimed})`);
      } else {
        addressesToMint.push(address);
        console.log(`✅ ${address} - Ready to mint`);
      }
    }

    if (alreadyClaimed.length > 0) {
      console.log(`\n📝 Note: ${alreadyClaimed.length} addresses have already claimed POAPs for this lecture`);
    }

    if (addressesToMint.length === 0) {
      console.log("\n🎯 All provided addresses have already claimed POAPs for this lecture. Nothing to mint!");
      return;
    }

    console.log(`\n🎯 Minting POAPs to ${addressesToMint.length} new addresses...`);

    // Batch mint POAPs
    const batchMintTx = await poap.batchMintPOAP(LECTURE_HASH, addressesToMint);
    console.log(`Transaction submitted: ${batchMintTx.hash}`);
    
    console.log("⏳ Waiting for transaction confirmation...");
    const mintReceipt = await batchMintTx.wait();
    
    console.log(`✅ Batch mint completed! Transaction hash: ${mintReceipt?.hash}`);

    // Verify the new mints
    console.log("\n🔍 Verifying new mints...");
    
    for (const address of addressesToMint) {
      const claimed = await poap.hasClaimed(LECTURE_HASH, address);
      
      if (Number(claimed) > 0) {
        console.log(`✅ ${address} - Successfully minted (Token ID: ${claimed})`);
      } else {
        console.log(`❌ ${address} - Mint failed`);
      }
    }

    // Final summary
    console.log("\n📊 Summary:");
    console.log(`Lecture Hash: ${LECTURE_HASH}`);
    console.log(`New POAPs minted: ${addressesToMint.length}`);
    console.log(`Already claimed: ${alreadyClaimed.length}`);
    console.log(`Total addresses processed: ${validAddresses.length}`);
    console.log(`Contract: ${CONTRACT_ADDRESS}`);

    console.log("\n🎉 Batch minting completed successfully!");

  } catch (error) {
    console.error("❌ Batch minting failed:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
