# Network Configuration Guide

## Overview

The NMP system now supports both local and public IP testing modes. You can easily switch between these modes using the configuration system.

## Configuration Files

### C-Client Configuration
- **File**: `src/main/c-client/config.json`
- **Controls**: URL parameter injection IP addresses

### B-Client Configuration  
- **File**: `src/main/discard-b/config.json`
- **Controls**: NSN server connection and API calls

## Quick Start

### Switch to Local IP Mode (Default)
```bash
cd src/main
node utils/switchNetworkMode.js local
```

### Switch to Public IP Mode
```bash
cd src/main
node utils/switchNetworkMode.js public
```

## Manual Configuration

You can also manually edit the configuration files:

### C-Client Config Example
```json
{
  "network": {
    "use_public_ip": false,
    "public_ip": "121.74.37.6",
    "local_ip": "127.0.0.1"
  },
  "api": {
    "nsn_port": 5000,
    "b_client_port": 3000
  }
}
```

### B-Client Config Example
```json
{
  "network": {
    "use_public_ip": false,
    "public_ip": "121.74.37.6",
    "local_ip": "127.0.0.1"
  },
  "api": {
    "nsn_port": 5000,
    "c_client_port_range": {
      "min": 3001,
      "max": 6000
    }
  }
}
```

## Testing Modes

### Local IP Mode (use_public_ip: false)
- **NSN Access**: `http://localhost:5000` or `http://127.0.0.1:5000`
- **URL Injection**: Uses `127.0.0.1` for IP parameters
- **Best for**: Local development and testing

### Public IP Mode (use_public_ip: true)
- **NSN Access**: `http://121.74.37.6:5000`
- **URL Injection**: Uses `121.74.37.6` for IP parameters
- **Best for**: Public testing and demonstration
- **Requirements**: Firewall configuration and network access

## How It Works

### C-Client URL Parameter Injection
When `use_public_ip: false`:
- Injects `nmp_ip_address=127.0.0.1`
- Uses local IP for all URL parameters

When `use_public_ip: true`:
- Injects `nmp_ip_address=121.74.37.6`
- Uses public IP for all URL parameters

### B-Client API Calls
When `use_public_ip: false`:
- Connects to NSN using `127.0.0.1:5000`
- Uses local network for all API calls

When `use_public_ip: true`:
- Connects to NSN using `121.74.37.6:5000`
- Uses public network for all API calls

## Troubleshooting

### Public IP Mode Not Working
1. **Check Firewall**: Ensure port 5000 is open
2. **Check Router**: Configure port forwarding if needed
3. **Check Network**: Verify public IP accessibility

### Local IP Mode Not Working
1. **Check Services**: Ensure NSN server is running
2. **Check Ports**: Verify no port conflicts
3. **Check Configuration**: Ensure `use_public_ip: false`

## Deployment Notes

### For PythonAnywhere Deployment
1. Set `use_public_ip: true` in both configs
2. Update `public_ip` to your PythonAnywhere domain
3. Ensure PythonAnywhere allows external connections

### For Local Development
1. Set `use_public_ip: false` in both configs
2. Use localhost URLs for testing
3. No firewall configuration needed

## Configuration Validation

The system will:
- Load configuration files on startup
- Fall back to default values if files are missing
- Log the current mode being used
- Apply settings to all relevant components

## Examples

### Switching Modes
```bash
# Start with local mode
node utils/switchNetworkMode.js local
npm run start:c-client
npm run start:b-client

# Test locally, then switch to public
node utils/switchNetworkMode.js public
# Restart clients to apply changes
```

### Manual Testing
```bash
# Local mode - access NSN via localhost
http://localhost:5000

# Public mode - access NSN via public IP  
http://121.74.37.6:5000
```

This configuration system allows you to easily switch between local development and public testing without code changes.
