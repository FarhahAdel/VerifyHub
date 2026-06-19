// 4_deploy_equivalency_agreement.js
const EquivalencyAgreement = artifacts.require("EquivalencyAgreement");
const fs = require('fs');
const path = require('node:path');

module.exports = async function (deployer) {
  try {
    await deployer.deploy(EquivalencyAgreement);
    const instance = await EquivalencyAgreement.deployed();

    // Ensure build directory exists
    const buildDir = path.join(__dirname, '../build/contracts');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // Read existing deployment config and merge
    const configPath = path.join(buildDir, 'deployment_config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    config.EquivalencyAgreement = instance.address;
    config.networkId = await web3.eth.net.getId();

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('Contract deployed at:', instance.address);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};
