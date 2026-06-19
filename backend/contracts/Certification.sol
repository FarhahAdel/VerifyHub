// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract Certification {
    struct Certificate {
        string referenceId;
        string candidateName;
        string courseName;
        string institutionName;
        string issuedDate;
        string institutionLogo;
        string generationDate;
        string blockchainTxId;
        string cryptographicSignature;
        string ipfsHash;
        uint256 timestamp;
        bool revoked;
    }

    mapping(string => Certificate) public certificates;
    address public owner;
    
    event CertificateGenerated(
        string indexed certificateId,
        string referenceId,
        string candidateName,
        string ipfsHash,
        uint256 timestamp
    );
    
    event CertificateRevoked(string indexed certificateId);
    event CertificateReactivated(string indexed certificateId);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner allowed");
        _;
    }

    function generateCertificate(
        string memory certificateId,
        string memory referenceId,
        string memory candidateName,
        string memory courseName,
        string memory institutionName,
        string memory issuedDate,
        string memory institutionLogo,
        string memory generationDate,
        string memory blockchainTxId,
        string memory cryptographicSignature,
        string memory ipfsHash
    ) public onlyOwner {
        require(
            bytes(certificates[certificateId].ipfsHash).length == 0,
            "Certificate exists"
        );
        require(bytes(certificateId).length > 0, "Empty ID");
        require(bytes(ipfsHash).length > 0, "Empty IPFS hash");

        certificates[certificateId] = Certificate({
            referenceId: referenceId,
            candidateName: candidateName,
            courseName: courseName,
            institutionName: institutionName,
            issuedDate: issuedDate,
            institutionLogo: institutionLogo,
            generationDate: generationDate,
            blockchainTxId: blockchainTxId,
            cryptographicSignature: cryptographicSignature,
            ipfsHash: ipfsHash,
            timestamp: block.timestamp,
            revoked: false
        });

        emit CertificateGenerated(certificateId, referenceId, candidateName, ipfsHash, block.timestamp);
    }

    function getCertificate(string memory certificateId)
        public
        view
        returns (
            string memory referenceId,
            string memory candidateName,
            string memory courseName,
            string memory institutionName,
            string memory issuedDate,
            string memory institutionLogo,
            string memory generationDate,
            string memory blockchainTxId,
            string memory cryptographicSignature,
            string memory ipfsHash,
            uint256 timestamp,
            bool revoked
        )
    {
        Certificate memory c = certificates[certificateId];
        require(bytes(c.referenceId).length != 0, "Certificate not found");
        return (
            c.referenceId,
            c.candidateName,
            c.courseName,
            c.institutionName,
            c.issuedDate,
            c.institutionLogo,
            c.generationDate,
            c.blockchainTxId,
            c.cryptographicSignature,
            c.ipfsHash,
            c.timestamp,
            c.revoked
        );
    }

    function isVerified(string memory certificateId) public view returns (bool) {
        Certificate memory c = certificates[certificateId];
        return bytes(c.referenceId).length != 0 && !c.revoked; 
    }

    function revokeCertificate(string memory certificateId) public onlyOwner {
        Certificate memory c = certificates[certificateId];
        require(bytes(c.referenceId).length != 0, "Certificate not found");
        require(!c.revoked, "Already revoked");
        
        certificates[certificateId].revoked = true;
        emit CertificateRevoked(certificateId);
    }

    /**
     * Reverses a revocation. Used when a student transfers back to an institute/course
     * they previously held a (now-revoked) certificate for — the original certificate
     * is restored instead of minting a redundant duplicate.
     */
    function reactivateCertificate(string memory certificateId) public onlyOwner {
        Certificate memory c = certificates[certificateId];
        require(bytes(c.referenceId).length != 0, "Certificate not found");
        require(c.revoked, "Certificate is not revoked");

        certificates[certificateId].revoked = false;
        emit CertificateReactivated(certificateId);
    }
}