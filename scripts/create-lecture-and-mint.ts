import { ethers } from "hardhat";
// import type { KoPOAP } from "../typechain-types";

async function main() {
  try {
    console.log("Creating lecture and batch minting POAPs...");

    // Get the signer account
    const [deployer] = await ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);

    // Contract address - UPDATE THIS with your deployed contract address
    // Run the deploy script first: npx hardhat run scripts/deploy-poap.ts --network your_network
      const CONTRACT_ADDRESS = "0xeE90454E72268dAA1b6f1174258d26e55bD8DBB4";
    
    if (CONTRACT_ADDRESS === "YOUR_CONTRACT_ADDRESS_HERE") {
      console.error("❌ Please update CONTRACT_ADDRESS with your deployed contract address");
      console.log("Run: npx hardhat run scripts/deploy-poap.ts --network your_network");
      process.exit(1);
    }
    
    // Lecture details - CUSTOMIZE THESE
    const lectureDetails = {
      name: "Deep Ocean House Webinar #1",
      description: "Introduction to Deep Ocean House and its mission.",
      tokenURI: "ipfs://bafkreicadjhkywoyb2laidmscjxsdvv4k6dsumumsg6zu4qykuzt7xztou", // Update with actual IPFS hash
    };

    // List of addresses to mint POAPs to - ADD YOUR ADDRESSES HERE
    const attendeeAddresses = [
      "0x34020209A8b882118141727E271E4379f3F2BF20",
      "0x9335Ce6B22bBB93485EF7A65BA22ABE0485efF3f",
      "0x0D6188641032B75EABB741C657Ae086f805c03D3",
      "0x0Bb12687DC69B5AaeD4Bc43a00eb8aEAb432378c",
      "0x993Da929C98975187909bc579aC99674E2C98301",
      "0x94f0933d17da6cc323297a73bc467a7448dcca77",
      "0x4188a8a860b22eb4449cF063197dFb9Da7d76EF9",
      "0x70D8Ba647000940123A18191FadbDEF4ff58bAf5",
    ];

    // Validate attendee addresses
    const invalidAddresses = attendeeAddresses.filter(addr => !ethers.isAddress(addr));
    if (invalidAddresses.length > 0) {
      console.error("❌ Invalid addresses found:", invalidAddresses);
      process.exit(1);
    }

    console.log(`Lecture: ${lectureDetails.name}`);
    console.log(`Attendees to mint: ${attendeeAddresses.length}`);

    // Calculate timestamps
    const currentTime = Math.floor(Date.now() / 1000);
    const oneWeekFromNow = currentTime + (7 * 24 * 60 * 60); // 7 days in seconds
    
    console.log(`Current time: ${new Date(currentTime * 1000).toISOString()}`);
    console.log(`Deadline: ${new Date(oneWeekFromNow * 1000).toISOString()}`);

    // Connect to the deployed contract
      const DOH = await ethers.getContractFactory("DeepOceanHousePOAP");
    const poap = DOH.attach(CONTRACT_ADDRESS) as any; // Type assertion for contract methods

    // Verify contract connection
    const contractName = await poap.name();
    console.log(`Connected to contract: ${contractName}`);

    // Check if deployer has MINTER_ROLE
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const hasMinterRole = await poap.hasRole(MINTER_ROLE, deployer.address);
    
    if (!hasMinterRole) {
      console.error("Deployer does not have MINTER_ROLE");
      process.exit(1);
    }

    console.log("✅ Deployer has MINTER_ROLE");

    // Step 1: Create the lecture
    console.log("\n📚 Creating lecture...");
    
    const createLectureTx = await poap.createLecture(
      lectureDetails.name,
      currentTime, // start time (now)
      oneWeekFromNow, // deadline (1 week from now)
      lectureDetails.tokenURI
    );

    const createReceipt = await createLectureTx.wait();
    console.log(`✅ Lecture created! Transaction hash: ${createReceipt?.hash}`);

    // Get the lecture hash from the event
    let lectureHash: string = "";
    
    if (createReceipt?.logs) {
      for (const log of createReceipt.logs) {
        try {
          const parsedLog = poap.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
          
          if (parsedLog && parsedLog.name === 'LectureCreated') {
            lectureHash = parsedLog.args[0];
            console.log(`📝 Lecture hash: ${lectureHash}`);
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }
    }

    if (!lectureHash) {
      console.error("Failed to get lecture hash from event");
      process.exit(1);
    }

    // Step 2: Batch mint POAPs
    console.log("\n🎯 Batch minting POAPs...");
    
    // Filter out any empty addresses
    const validAddresses = attendeeAddresses.filter(addr => 
      addr && addr !== "YOUR_ADDRESS_HERE" && ethers.isAddress(addr)
    );

    if (validAddresses.length === 0) {
      console.error("No valid addresses found. Please update the attendeeAddresses array.");
      process.exit(1);
    }

    console.log(`Minting to ${validAddresses.length} addresses...`);

    const batchMintTx = await poap.batchMintPOAP(lectureHash, validAddresses);
    const mintReceipt = await batchMintTx.wait();
    
    console.log(`✅ Batch mint completed! Transaction hash: ${mintReceipt?.hash}`);

    // Step 3: Verify mints
    console.log("\n🔍 Verifying mints...");
    
    for (let i = 0; i < validAddresses.length; i++) {
      const address = validAddresses[i];
      const claimed = await poap.hasClaimed(lectureHash, address);
      
      if (claimed > 0) {
        console.log(`✅ ${address} - Token ID: ${claimed}`);
      } else {
        console.log(`❌ ${address} - Not claimed`);
      }
    }

    // Step 4: Summary
    console.log("\n📊 Summary:");
    console.log(`Lecture: "${lectureDetails.name}"`);
    console.log(`Lecture Hash: ${lectureHash}`);
    console.log(`Deadline: ${new Date(oneWeekFromNow * 1000).toISOString()}`);
    console.log(`Total attendees: ${validAddresses.length}`);
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    
    const lectureCount = await poap.getLectureCount();
    console.log(`Total lectures created: ${lectureCount}`);

    console.log("\n🎉 Process completed successfully!");

  } catch (error) {
    console.error("❌ Process failed:", error);
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
