# Error Handling Enhancement Plan

## Overview
This document outlines the planned improvements to error handling and reporting in the MCP Rewatch codebase. The goal is to provide better debugging information for developers and clearer, actionable feedback for users.

## Priority 1: Critical Error Handling

### 1. Configuration Loading (src/index.ts:18-29)
**Current Issues:**
- Returns empty config on any error, masking important issues
- No file existence check
- No JSON structure validation

**Implementation:**
- Check if config file exists before reading
- Provide specific error for missing config with example reference
- Validate required fields after parsing
- Exit with error code if config is invalid (fatal error)

### 2. Process Spawning (src/process-manager.ts:71-108)
**Current Issues:**
- Generic error handling for spawn failures
- No differentiation between error types
- Insufficient context in error messages

**Implementation:**
- Add spawn event listener for immediate success detection
- Handle specific error codes:
  - ENOENT: Command not found
  - EACCES: Permission denied
  - ENOTDIR: Invalid working directory
- Include command and path info in error messages

### 3. Tool Input Validation (src/index.ts:36-142)
**Current Issues:**
- No parameter validation
- No process existence checks
- Generic error responses

**Implementation:**
- Validate all parameters (types, ranges, required fields)
- Check process exists before operations
- Return available processes when invalid name provided
- Add try-catch blocks to all tool handlers

## Priority 2: Operational Improvements

### 4. Process Termination (src/process-manager.ts:111-142)
**Current Issues:**
- No logging of signal attempts
- Cleanup can be called multiple times
- Force kill timeout might be too aggressive

**Implementation:**
- Log SIGTERM and SIGKILL attempts
- Add guard to prevent multiple cleanup calls
- Extend timeout to 5 seconds
- Handle kill failures gracefully

### 5. Graceful Shutdown (src/index.ts:145-154)
**Current Issues:**
- No cleanup on server shutdown
- Basic error handling in main function
- No signal handlers

**Implementation:**
- Add SIGTERM and SIGINT handlers
- Stop all processes before exit
- Differentiate startup vs runtime errors
- Attempt cleanup even on fatal errors

## Priority 3: Quality of Life Improvements

### 6. Log Buffer Protection (src/log-buffer.ts)
**Current Issues:**
- No protection against extremely long lines
- No memory exhaustion prevention
- No error handling for operations

**Implementation:**
- Truncate lines over 5000 characters
- Add error handling for timestamp generation
- Remove multiple lines when over limit

### 7. User-Friendly Error Messages
**Current Issues:**
- Generic error messages throughout
- Lack of context about failures
- No suggested solutions

**Implementation:**
- Create standardized error format
- Include what was attempted
- Suggest possible solutions
- Distinguish recoverable vs fatal errors

## Implementation Order

1. **Phase 1 - Critical Path** (High Priority)
   - Configuration loading improvements
   - Process spawn error handling
   - Tool input validation

2. **Phase 2 - Stability** (Medium Priority)
   - Process termination improvements
   - Graceful shutdown handlers
   - Comprehensive error context

3. **Phase 3 - Polish** (Low Priority)
   - Log buffer protections
   - Additional error message improvements

## Success Criteria

- Users receive clear, actionable error messages
- Developers can quickly identify failure points
- System fails gracefully with proper cleanup
- No silent failures or masked errors
- Resource leaks are prevented

## Testing Approach

- Test with missing/invalid config files
- Test with non-existent commands
- Test with permission issues
- Test with invalid parameters
- Test graceful shutdown scenarios
- Test memory limits with large logs