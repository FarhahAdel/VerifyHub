// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/**
 * EquivalencyAgreement
 * ─────────────────────
 * Bilateral course-equivalency agreements between two institutes.
 *
 * Lifecycle:
 *   Proposed  -> proposeAgreement() by institute A, naming institute B as counterparty
 *   Active    -> acceptAgreement() by institute B (countersignature)
 *   Revoked   -> revokeAgreement() by EITHER party, from Proposed or Active, at any time
 *
 * Course pairs reference off-chain Course documents (MongoDB ObjectId strings),
 * the same way StudentRegistry references certificateIds as strings.
 */
contract EquivalencyAgreement {

    // ─── Types ──────────────────────────────────────────────────────────────────

    enum Status { Proposed, Active, Revoked }

    struct CoursePair {
        string instituteACourseId; // Course._id at instituteA, as a string
        string instituteBCourseId; // Course._id at instituteB, as a string
    }

    struct Agreement {
        address instituteA;     // proposer
        address instituteB;     // counterparty
        Status  status;
        uint256 proposedAt;
        uint256 respondedAt;    // accepted-at or revoked-at, whichever happened
        address revokedBy;      // address(0) until revoked
        CoursePair[] pairs;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    address public owner;
    uint256 public agreementCount;

    mapping(uint256 => Agreement) private agreements;

    // institute wallet → ids of every agreement it is a party to (as A or B)
    mapping(address => uint256[]) private instituteAgreements;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event AgreementProposed(
        uint256 indexed agreementId,
        address indexed instituteA,
        address indexed instituteB,
        uint256 pairCount
    );
    event AgreementAccepted(uint256 indexed agreementId, address indexed acceptedBy);
    event AgreementRevoked(uint256 indexed agreementId, address indexed revokedBy);

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner allowed");
        _;
    }

    modifier agreementExists(uint256 id) {
        require(id > 0 && id <= agreementCount, "Agreement does not exist");
        _;
    }

    modifier onlyParty(uint256 id, address who) {
        Agreement storage a = agreements[id];
        require(who == a.instituteA || who == a.instituteB, "Not a party to this agreement");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Write functions (onlyOwner) ────────────────────────────────────────────

    /**
     * Propose a new bilateral agreement. Called by the backend on behalf of the
     * proposing institute. `proposerCourseIds[i]` is defined as equivalent to
     * `counterpartyCourseIds[i]` for every i.
     */
    function proposeAgreement(
        address proposer,
        address counterparty,
        string[] memory proposerCourseIds,
        string[] memory counterpartyCourseIds
    ) public onlyOwner returns (uint256) {
        require(proposer != address(0) && counterparty != address(0), "Zero address");
        require(proposer != counterparty, "Cannot propose an agreement with yourself");
        require(proposerCourseIds.length == counterpartyCourseIds.length, "Course pair length mismatch");
        require(proposerCourseIds.length > 0, "At least one course pair is required");

        agreementCount++;
        uint256 id = agreementCount;

        Agreement storage a = agreements[id];
        a.instituteA = proposer;
        a.instituteB = counterparty;
        a.status = Status.Proposed;
        a.proposedAt = block.timestamp;

        for (uint256 i = 0; i < proposerCourseIds.length; i++) {
            require(bytes(proposerCourseIds[i]).length > 0, "Empty course id");
            require(bytes(counterpartyCourseIds[i]).length > 0, "Empty course id");
            a.pairs.push(CoursePair({
                instituteACourseId: proposerCourseIds[i],
                instituteBCourseId: counterpartyCourseIds[i]
            }));
        }

        instituteAgreements[proposer].push(id);
        instituteAgreements[counterparty].push(id);

        emit AgreementProposed(id, proposer, counterparty, proposerCourseIds.length);
        return id;
    }

    /**
     * Countersign a proposed agreement. Only the named counterparty (institute B)
     * may accept, and only while the agreement is still Proposed.
     */
    function acceptAgreement(uint256 id, address acceptor)
        public onlyOwner agreementExists(id)
    {
        Agreement storage a = agreements[id];
        require(a.status == Status.Proposed, "Agreement is not awaiting acceptance");
        require(acceptor == a.instituteB, "Only the counterparty can accept");

        a.status = Status.Active;
        a.respondedAt = block.timestamp;

        emit AgreementAccepted(id, acceptor);
    }

    /**
     * Revoke an agreement. Either party may revoke at any time, whether the
     * agreement is still Proposed (withdraw / decline) or already Active
     * (terminate). Revocation is final.
     */
    function revokeAgreement(uint256 id, address revoker)
        public onlyOwner agreementExists(id) onlyParty(id, revoker)
    {
        Agreement storage a = agreements[id];
        require(a.status != Status.Revoked, "Agreement is already revoked");

        a.status = Status.Revoked;
        a.respondedAt = block.timestamp;
        a.revokedBy = revoker;

        emit AgreementRevoked(id, revoker);
    }

    // ─── Read functions (public view) ───────────────────────────────────────────

    function getAgreement(uint256 id)
        public view
        agreementExists(id)
        returns (
            address instituteA,
            address instituteB,
            Status  status,
            uint256 proposedAt,
            uint256 respondedAt,
            address revokedBy,
            uint256 pairCount
        )
    {
        Agreement storage a = agreements[id];
        return (a.instituteA, a.instituteB, a.status, a.proposedAt, a.respondedAt, a.revokedBy, a.pairs.length);
    }

    function getCoursePair(uint256 id, uint256 index)
        public view
        agreementExists(id)
        returns (string memory instituteACourseId, string memory instituteBCourseId)
    {
        require(index < agreements[id].pairs.length, "Pair index out of range");
        CoursePair storage p = agreements[id].pairs[index];
        return (p.instituteACourseId, p.instituteBCourseId);
    }

    function getAllCoursePairs(uint256 id)
        public view
        agreementExists(id)
        returns (string[] memory instituteACourseIds, string[] memory instituteBCourseIds)
    {
        Agreement storage a = agreements[id];
        uint256 len = a.pairs.length;
        instituteACourseIds = new string[](len);
        instituteBCourseIds = new string[](len);
        for (uint256 i = 0; i < len; i++) {
            instituteACourseIds[i] = a.pairs[i].instituteACourseId;
            instituteBCourseIds[i] = a.pairs[i].instituteBCourseId;
        }
    }

    /**
     * Every agreement id a given institute is a party to (as proposer or counterparty).
     */
    function getInstituteAgreements(address institute) public view returns (uint256[] memory) {
        return instituteAgreements[institute];
    }

    function isActiveAgreement(uint256 id) public view agreementExists(id) returns (bool) {
        return agreements[id].status == Status.Active;
    }
}
