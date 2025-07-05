// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {ERC721} from "./base/ERC721Modified.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {NotAllowed, PAUSER_ROLE, MINTER_ROLE, DEFAULT_ADMIN_ROLE, ArraysDifferentLengthError} from "./lib/Model.sol";

/**
 * @title DOH
 * @dev ERC721 contract for issuing Proof of Attendance
 */
contract DeepOceanHousePOAP is ERC721, AccessControl, Pausable {
    mapping(bytes32 => LectureInfo) private _lectures;
    
    // Mapping to track which addresses have claimed which lecture POAPs
    mapping(bytes32 => mapping(address => uint256)) private _claimed;

    // Mapping from token ID to lecture hash
    mapping(uint256 => bytes32) private _tokenToLectureHash;
    
    // Mapping from address to their token IDs (for the getTokensOfOwner function)
    mapping(address => uint256[]) private _ownedTokens;

    // Current token ID counter
    uint256 private _tokenIdCounter;

    // Lecture ID counter
    bytes32[] public lectureCounter;
    
    struct LectureInfo {
        bytes32 lectureHash;
        string name;
        uint256 start;
        uint256 deadline;
        string tokenURI;
    }
    
    event LectureCreated(bytes32 indexed lectureHash, string name, uint256 start, uint256 deadline, string tokenURI);
    event POAPClaimed(bytes32 indexed lectureHash, address indexed attendee, uint256 tokenId);

    constructor(
        string memory name_, 
        string memory symbol_,
        address defaultAdmin, 
        address pauser, 
        address minter
    ) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(MINTER_ROLE, minter);
    }
    
    /**
     * @dev Creates a new lecture POAP
     * @param name Name of the lecture
     * @param start Start time of the lecture
     * @param deadline Time until when POAPs can be claimed
     * @param uri URI for the token metadata
     */
    function createLecture(string memory name, uint256 start, uint256 deadline, string memory uri)
        public 
        onlyRole(MINTER_ROLE) 
        whenNotPaused 
    {        
        // Generate a unique hash for this lecture using name, deadline, and URI
        bytes32 lectureHash = keccak256(abi.encodePacked(name, deadline, uri));

        require(_lectures[lectureHash].lectureHash == bytes32(0), "Lecture already exists");
        
        _lectures[lectureHash] = LectureInfo({
            lectureHash: lectureHash,
            name: name,
            start: start,
            deadline: deadline,
            tokenURI: uri
        });
        
        lectureCounter.push(lectureHash);
                
        emit LectureCreated(lectureHash, name, start, deadline, uri);
    }
    
    
    /**
     * @dev Admin mints POAP to attendee
     * @param lectureHash Hash of the lecture
     * @param attendee Address of the attendee
     * @return tokenId The minted token ID
     */
    function mintPOAP(bytes32 lectureHash, address attendee) 
        public 
        onlyRole(MINTER_ROLE) 
        whenNotPaused
        returns (uint256)
    {
        require(_lectures[lectureHash].lectureHash != bytes32(0), "Invalid lecture ID");
        require(_lectures[lectureHash].start <= block.timestamp, "Lecture has not started yet");
        require(block.timestamp <= _lectures[lectureHash].deadline, "Lecture is not active");
        require(_claimed[lectureHash][attendee] == 0, "POAP already claimed");
        
        
        // Increment token ID counter
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        _claimed[lectureHash][attendee] = tokenId;

        // Mint the token
        _mint(attendee, tokenId);
        _tokenToLectureHash[tokenId] = lectureHash;
        
        // Track the owner's tokens
        _ownedTokens[attendee].push(tokenId);
        
        emit POAPClaimed(lectureHash, attendee, tokenId);
        
        return tokenId;
    }
    
    /**
     * @dev Batch mint POAPs to multiple attendees
     * @param lectureHash Hash of the lecture
     * @param attendees Addresses of attendees
     */
    function batchMintPOAP(bytes32 lectureHash, address[] memory attendees) 
        external
        onlyRole(MINTER_ROLE) 
        whenNotPaused 
    {
        require(_lectures[lectureHash].start != block.timestamp, "Lecture has not started yet");
        require(block.timestamp <= _lectures[lectureHash].deadline, "Lecture is not active or invalid");
        
        for (uint256 i = 0; i < attendees.length; i++) {
            if (_claimed[lectureHash][attendees[i]] == 0) {
                mintPOAP(lectureHash, attendees[i]);
            }
        }
    }
    
    /**
     * @dev Check if an attendee has claimed a POAP for a lecture
     * @param lectureHash ID of the lecture
     * @param attendee Address of the attendee
     */
    function hasClaimed(bytes32 lectureHash, address attendee) 
        external 
        view 
        returns (uint256) 
    {
        return _claimed[lectureHash][attendee];
    }
    
    /**
     * @dev Get lecture information
     * @param lectureId ID of the lecture
     */
    function getLecture(uint256 lectureId) 
        external 
        view 
        returns (LectureInfo memory)
    {
        return _lectures[lectureCounter[lectureId]];
    }


    /**
     * @dev Get lecture information by hash
     * @param lectureHash Hash of the lecture
     */
    function getLectureByHash(bytes32 lectureHash) 
        external 
        view 
        returns (LectureInfo memory)
    {
        return _lectures[lectureHash];
    }


    /**
     * @dev Get the token URI for a specific token ID
     * @param tokenId The ID of the token
     * @return The token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _lectures[_tokenToLectureHash[tokenId]].tokenURI;
    }
    
    /**
     * @dev Base URI for computing tokenURI
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return "";
    }
    
    /**
     * @dev Get total number of lectures
     */
    function getLectureCount() external view returns (uint256) {
        return lectureCounter.length;
    }

    /**
     * @dev Get all token IDs owned by a specific address
     * @param owner The address to query
     * @return An array of token IDs
     */
    function getTokensOfOwner(address owner) external view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }
    
    /**
     * @dev Pause contract
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Required override for AccessControl/ERC721
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
