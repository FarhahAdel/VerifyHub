// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/**
 * CreditTransferEvaluation
 * ─────────────────────────
 * Automated evaluation of a student's certificates against the active
 * EquivalencyAgreement between their source and destination institute.
 *
 * The backend performs the matching off-chain (certificates live in MongoDB,
 * course catalogs reference EquivalencyAgreement course pairs) and then
 * writes the resulting accepted/rejected lists here as a single immutable
 * record — the same off-chain-reference pattern used by StudentRegistry
 * (certificateIds) and EquivalencyAgreement (course pair ids).
 *
 * Lifecycle of one evaluation:
 *   recordEvaluation()      -> backend writes the accepted/rejected lists, once
 *   markEnrollmentUpdated() -> backend flips a one-way flag after it separately
 *                               calls StudentRegistry.enrollStudent() for the
 *                               destination institute (only when >=1 course accepted)
 *
 * Nothing about a recorded evaluation's results can be changed after the fact —
 * there is deliberately no update/delete for `results`. This contract does not
 * perform the enrollment switch itself; it stays a pure record of what was
 * evaluated, and the enrollment hand-off is left to StudentRegistry so each
 * contract keeps a single responsibility.
 */
contract CreditTransferEvaluation {

    // ─── Types ──────────────────────────────────────────────────────────────────

    struct CourseResult {
        string certificateId;       // Certification.sol / StudentRegistry certificate id
        string sourceCourseId;      // Course._id at the source institute ("" if no catalog match)
        string destinationCourseId; // Course._id at the destination institute ("" if rejected)
        bool   accepted;            // true => a matching equivalency rule was found
    }

    struct Evaluation {
        address student;
        address sourceInstitute;
        address destinationInstitute;
        uint256 agreementId;        // EquivalencyAgreement id the evaluation was run against
        uint256 evaluatedAt;
        uint256 acceptedCount;
        uint256 rejectedCount;
        bool    enrollmentUpdated;  // set once, true if acceptance triggered a re-enrollment
        CourseResult[] results;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    address public owner;
    uint256 public evaluationCount;

    mapping(uint256 => Evaluation) private evaluations;

    // student wallet → ids of every evaluation run for them
    mapping(address => uint256[]) private studentEvaluations;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event TransferEvaluated(
        uint256 indexed evaluationId,
        address indexed student,
        address indexed sourceInstitute,
        address destinationInstitute,
        uint256 agreementId,
        uint256 acceptedCount,
        uint256 rejectedCount
    );

    event EnrollmentUpdatedFromTransfer(
        uint256 indexed evaluationId,
        address indexed student,
        address indexed destinationInstitute
    );

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner allowed");
        _;
    }

    modifier evaluationExists(uint256 id) {
        require(id > 0 && id <= evaluationCount, "Evaluation does not exist");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Write functions (onlyOwner) ────────────────────────────────────────────

    /**
     * Record one completed transfer evaluation. `certificateIds[i]` evaluates to
     * `accepted[i]`; when accepted, `destinationCourseIds[i]` names the matching
     * destination-institute course. Arrays may be empty (a student with zero
     * certificates from the source institute still produces a valid, recorded
     * evaluation with acceptedCount == rejectedCount == 0).
     */
    function recordEvaluation(
        address student,
        address sourceInstitute,
        address destinationInstitute,
        uint256 agreementId,
        string[] memory certificateIds,
        string[] memory sourceCourseIds,
        string[] memory destinationCourseIds,
        bool[] memory accepted
    ) public onlyOwner returns (uint256) {
        require(student != address(0), "Zero student address");
        require(sourceInstitute != address(0) && destinationInstitute != address(0), "Zero institute address");
        require(sourceInstitute != destinationInstitute, "Source and destination must differ");
        require(
            certificateIds.length == sourceCourseIds.length &&
            certificateIds.length == destinationCourseIds.length &&
            certificateIds.length == accepted.length,
            "Result array length mismatch"
        );

        evaluationCount++;
        uint256 id = evaluationCount;

        Evaluation storage e = evaluations[id];
        e.student = student;
        e.sourceInstitute = sourceInstitute;
        e.destinationInstitute = destinationInstitute;
        e.agreementId = agreementId;
        e.evaluatedAt = block.timestamp;

        uint256 acceptedCount = 0;
        for (uint256 i = 0; i < certificateIds.length; i++) {
            require(bytes(certificateIds[i]).length > 0, "Empty certificate id");

            e.results.push(CourseResult({
                certificateId: certificateIds[i],
                sourceCourseId: sourceCourseIds[i],
                destinationCourseId: destinationCourseIds[i],
                accepted: accepted[i]
            }));

            if (accepted[i]) acceptedCount++;
        }

        e.acceptedCount = acceptedCount;
        e.rejectedCount = certificateIds.length - acceptedCount;

        studentEvaluations[student].push(id);

        emit TransferEvaluated(
            id, student, sourceInstitute, destinationInstitute,
            agreementId, e.acceptedCount, e.rejectedCount
        );
        return id;
    }

    /**
     * One-way flag flip: called by the backend after it separately invokes
     * StudentRegistry.enrollStudent(student, destinationInstitute) following an
     * evaluation that accepted at least one course. Cannot be unset or set twice.
     */
    function markEnrollmentUpdated(uint256 id)
        public onlyOwner evaluationExists(id)
    {
        Evaluation storage e = evaluations[id];
        require(!e.enrollmentUpdated, "Enrollment already marked as updated");
        require(e.acceptedCount > 0, "No accepted courses to justify enrollment update");

        e.enrollmentUpdated = true;

        emit EnrollmentUpdatedFromTransfer(id, e.student, e.destinationInstitute);
    }

    // ─── Read functions (public view) ───────────────────────────────────────────

    function getEvaluation(uint256 id)
        public view
        evaluationExists(id)
        returns (
            address student,
            address sourceInstitute,
            address destinationInstitute,
            uint256 agreementId,
            uint256 evaluatedAt,
            uint256 acceptedCount,
            uint256 rejectedCount,
            bool    enrollmentUpdated,
            uint256 resultCount
        )
    {
        Evaluation storage e = evaluations[id];
        return (
            e.student, e.sourceInstitute, e.destinationInstitute, e.agreementId,
            e.evaluatedAt, e.acceptedCount, e.rejectedCount, e.enrollmentUpdated, e.results.length
        );
    }

    function getEvaluationResult(uint256 id, uint256 index)
        public view
        evaluationExists(id)
        returns (
            string memory certificateId,
            string memory sourceCourseId,
            string memory destinationCourseId,
            bool accepted
        )
    {
        require(index < evaluations[id].results.length, "Result index out of range");
        CourseResult storage r = evaluations[id].results[index];
        return (r.certificateId, r.sourceCourseId, r.destinationCourseId, r.accepted);
    }

    function getAllEvaluationResults(uint256 id)
        public view
        evaluationExists(id)
        returns (
            string[] memory certificateIds,
            string[] memory sourceCourseIds,
            string[] memory destinationCourseIds,
            bool[] memory accepted
        )
    {
        Evaluation storage e = evaluations[id];
        uint256 len = e.results.length;
        certificateIds = new string[](len);
        sourceCourseIds = new string[](len);
        destinationCourseIds = new string[](len);
        accepted = new bool[](len);
        for (uint256 i = 0; i < len; i++) {
            certificateIds[i] = e.results[i].certificateId;
            sourceCourseIds[i] = e.results[i].sourceCourseId;
            destinationCourseIds[i] = e.results[i].destinationCourseId;
            accepted[i] = e.results[i].accepted;
        }
    }

    /**
     * Every evaluation id ever run for a given student, oldest first.
     */
    function getStudentEvaluations(address student) public view returns (uint256[] memory) {
        return studentEvaluations[student];
    }
}
