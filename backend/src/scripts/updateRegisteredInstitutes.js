/**
 * updateCertificateIssuers.js
 * ============================
 * 
 * IMPORTANT: DO NOT DELETE THIS FILE - It's a critical database migration utility.
 * 
 * Purpose:
 * This script updates certificates in the database that are missing the "issuer" field.
 * It matches certificates to institution users based on the orgName field and 
 * adds the appropriate user ID as the issuer.
 * 
 * Problem it solves:
 * Older certificates in the database may not have the "issuer" field populated
 * (which should contain the MongoDB ObjectId of the institution user who created 
 * the certificate). Without this field, certain queries like user stats won't work properly.
 * 
 * How it works:
 * 1. Connects to MongoDB using the database connection string
 * 2. Finds all certificates where the "issuer" field doesn't exist
 * 3. Groups these certificates by organization name (orgName)
 * 4. For each organization, it:
 *    - Finds a user with matching name and role "INSTITUTE"
 *    - Updates all certificates for that organization with the user's ID as the "issuer"
 * 5. Logs the process and results for monitoring
 * 
 * When to use it:
 * Run this script as a one-time operation when:
 * - You've added a new field to certificates that needs to be backfilled
 * - You notice missing data in certificates (specifically the issuer field)
 * - After upgrading your application if the data schema has changed
 * 
 * How to run:
 * From project root: node src/scripts/updateCertificateIssuers.js
 */

import mongoose from 'mongoose';
import User from '../models/user.model.js';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/verificationDB';
const CONTRACT_ADDRESS = process.env.STUDENT_REGISTRY_CONTRACT_ADDRESS;
console.log(process.env.STUDENT_REGISTRY_CONTRACT_ADDRESS)
const RPC_URL = process.env.PROVIDER_URL || 'http://localhost:8545';
const OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const contractPath = path.join(process.cwd(), 'build/contracts/StudentRegistry.json');
const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const CONTRACT_ABI = contractJson.abi;

/**
 * This script updates all certificates with a missing issuer field
 * It matches certificates to users based on the orgName field
 */
async function migrateInstitutes() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 2. Fetch institutes not yet registered on-chain (or all, if no flag)
    const institutes = await User.find({ role: "INSTITUTE" });
    console.log(`📋 Found ${institutes.length} institutes to register`);

    if (institutes.length === 0) {
      console.log('No new institutes to migrate.');
      await mongoose.disconnect();
      return;
    }

    // 3. Connect to blockchain
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    console.log(`👤 Using owner address: ${wallet.address}`);

    // 4. Register each institute
    for (const inst of institutes) {
      console.log(`➡️ Registering ${inst.name} (${inst.walletAddress})...`);
      try {
        // Check if already registered on-chain (optional safety)
        const isRegistered = await contract.isInstituteRegistered(inst.walletAddress);
        if (isRegistered) {
          console.log(`⚠️ Already registered on-chain, skipping.`);
          // Optionally update MongoDB flag
          inst.registeredOnChain = true;
          await inst.save();
          continue;
        }

        const tx = await contract.registerInstitute(inst.walletAddress, inst.name);
        await tx.wait();
        console.log(`✅ Success: ${inst.name}`);

      } catch (error) {
        console.error(`❌ Failed for ${inst.walletAddress}: ${error.message}`);
        // Continue with next institute – don't break the whole migration
      }
    }

    console.log('🏁 Migration completed');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
migrateInstitutes()
  .then(() => {
    console.log('Script execution completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  }); 