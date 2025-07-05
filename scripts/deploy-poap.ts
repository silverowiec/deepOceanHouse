import { ethers } from "hardhat";

async function main() {
  try {
    console.log("Deploying DOH POAP contract...");

    // Get the signer account from private key (already configured in hardhat.config.ts)
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);

    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

    // Deploy the DOH POAP contract
    // Parameters for constructor:
    // 1. Name of the token
    // 2. Symbol of the token
    // 3. defaultAdmin - the deployer address will have admin role
    // 4. pauser - the deployer address will have pauser role
    // 5. minter - the deployer address will have minter role

    
    const DOH = await ethers.getContractFactory("DeepOceanHousePOAP");
    const poap = await DOH.deploy(
      "Deep Ocean House POAP", // name
      "DOHPOAP", // symbol
      deployer.address, // Admin role
      deployer.address, // Pauser role
      deployer.address  // Minter role
    );

    await poap.waitForDeployment();
    
    const address = await poap.getAddress();
    console.log(`DOH contract deployed to: ${address}`);

    console.log("Deployment completed successfully!");
    
    // Return the contract instance and address for potential post-deployment testing
    return { poap, address };
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
  