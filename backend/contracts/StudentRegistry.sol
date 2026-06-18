// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract StudentRegistry {

    // ─── Structs ────────────────────────────────────────────────────────────────

    struct Student {
        string  name;
        address walletAddress;
        address enrolledInstitute;   // 0x0 means not enrolled
        string[] certificateIds;
        bool    registered;
    }

    struct Institute {
        string  name;
        address walletAddress;
        bool    registered;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    address public owner;

    mapping(address => Student)   public students;
    mapping(address => Institute) public institutes;

    // institute wallet → list of enrolled student wallets
    mapping(address => address[]) private instituteStudents;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event StudentRegistered(address indexed walletAddress, string name);
    event InstituteRegistered(address indexed walletAddress, string name);
    event StudentEnrolled(address indexed studentWallet, address indexed instituteWallet);
    event StudentUnenrolled(address indexed studentWallet, address indexed previousInstitute);
    event CertificateLinked(address indexed studentWallet, string certificateId);

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner allowed");
        _;
    }

    modifier studentExists(address wallet) {
        require(students[wallet].registered, "Student not registered");
        _;
    }

    modifier instituteExists(address wallet) {
        require(institutes[wallet].registered, "Institute not registered");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Write functions (onlyOwner) ────────────────────────────────────────────

    /**
     * Register an institute on-chain.
     * Called automatically when an INSTITUTE account is created in the backend.
     */
    function registerInstitute(address walletAddress, string memory name)
        public onlyOwner
    {
        require(walletAddress != address(0), "Zero address");
        require(!institutes[walletAddress].registered, "Already registered");
        require(bytes(name).length > 0, "Empty name");

        institutes[walletAddress] = Institute({
            name: name,
            walletAddress: walletAddress,
            registered: true
        });

        emit InstituteRegistered(walletAddress, name);
    }

    /**
     * Register a student on-chain.
     * Called automatically when a STUDENT account is created in the backend.
     */
    function registerStudent(address walletAddress, string memory name)
        public onlyOwner
    {
        require(walletAddress != address(0), "Zero address");
        require(!students[walletAddress].registered, "Already registered");
        require(bytes(name).length > 0, "Empty name");

        students[walletAddress].name          = name;
        students[walletAddress].walletAddress = walletAddress;
        students[walletAddress].registered    = true;
        // enrolledInstitute defaults to address(0) — not enrolled

        emit StudentRegistered(walletAddress, name);
    }

    /**
     * Enroll a student into an institute.
     * Replaces any existing enrollment (one-institute-at-a-time rule).
     */
    function enrollStudent(address studentWallet, address instituteWallet)
        public onlyOwner
        studentExists(studentWallet)
        instituteExists(instituteWallet)
    {
        address prev = students[studentWallet].enrolledInstitute;

        // Remove from previous institute's list if applicable
        if (prev != address(0) && prev != instituteWallet) {
            _removeFromInstituteList(prev, studentWallet);
            emit StudentUnenrolled(studentWallet, prev);
        }

        students[studentWallet].enrolledInstitute = instituteWallet;
        instituteStudents[instituteWallet].push(studentWallet);

        emit StudentEnrolled(studentWallet, instituteWallet);
    }

    /**
     * Unenroll a student from their current institute.
     */
    function unenrollStudent(address studentWallet)
        public onlyOwner
        studentExists(studentWallet)
    {
        address prev = students[studentWallet].enrolledInstitute;
        require(prev != address(0), "Not enrolled");

        _removeFromInstituteList(prev, studentWallet);
        students[studentWallet].enrolledInstitute = address(0);

        emit StudentUnenrolled(studentWallet, prev);
    }

    /**
     * Append a certificate ID to a student's on-chain profile.
     * Called after a certificate is successfully registered on Certification.sol.
     */
    function linkCertificate(address studentWallet, string memory certificateId)
        public onlyOwner
        studentExists(studentWallet)
    {
        require(bytes(certificateId).length > 0, "Empty certificate ID");

        // Reject duplicate certificate IDs
        string[] storage certs = students[studentWallet].certificateIds;
        for (uint i = 0; i < certs.length; i++) {
            require(
                keccak256(bytes(certs[i])) != keccak256(bytes(certificateId)),
                "Certificate already linked"
            );
        }

        students[studentWallet].certificateIds.push(certificateId);
        emit CertificateLinked(studentWallet, certificateId);
    }

    // ─── Read functions (public view) ───────────────────────────────────────────

    function isStudentRegistered(address wallet) public view returns (bool) {
        return students[wallet].registered;
    }

    function isInstituteRegistered(address wallet) public view returns (bool) {
        return institutes[wallet].registered;
    }

    /**
     * Returns the institute wallet a student is currently enrolled in.
     * Returns address(0) if not enrolled.
     */
    function getEnrolledInstitute(address studentWallet)
        public view
        studentExists(studentWallet)
        returns (address)
    {
        return students[studentWallet].enrolledInstitute;
    }

    /**
     * Returns full student profile: name, walletAddress, enrolledInstitute, certificateIds.
     */
    function getStudent(address walletAddress)
        public view
        studentExists(walletAddress)
        returns (
            string memory name,
            address wallet,
            address enrolledInstitute,
            string[] memory certificateIds
        )
    {
        Student storage s = students[walletAddress];
        return (s.name, s.walletAddress, s.enrolledInstitute, s.certificateIds);
    }

    /**
     * Returns all student wallet addresses enrolled in a given institute.
     */
    function getInstituteStudents(address instituteWallet)
        public view
        returns (address[] memory)
    {
        return instituteStudents[instituteWallet];
    }

    /**
     * Verify a student is enrolled in a specific institute.
     */
    function isEnrolledIn(address studentWallet, address instituteWallet)
        public view
        returns (bool)
    {
        if (!students[studentWallet].registered) return false;
        return students[studentWallet].enrolledInstitute == instituteWallet;
    }

    // ─── Internal helpers ───────────────────────────────────────────────────────

    function _removeFromInstituteList(address instituteWallet, address studentWallet) internal {
        address[] storage list = instituteStudents[instituteWallet];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == studentWallet) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }
}