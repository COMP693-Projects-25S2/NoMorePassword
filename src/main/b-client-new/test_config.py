#!/usr/bin/env python3
"""
Test script for configuration manager
"""
import sys
import os

# Add the parent directory to the path
sys.path.append(os.path.dirname(__file__))

from utils.config_manager import get_config_manager, get_nsn_base_url, get_nsn_api_url, get_current_environment

def test_config_manager():
    """Test configuration manager functionality"""
    print("=== Configuration Manager Test ===\n")
    
    # Test configuration manager
    config_manager = get_config_manager()
    print(f"Current environment: {get_current_environment()}")
    print(f"NSN base URL: {get_nsn_base_url()}")
    print(f"NSN session data API: {get_nsn_api_url('session_data')}")
    print(f"NSN signup API: {get_nsn_api_url('signup')}")
    print(f"NSN login API: {get_nsn_api_url('login')}")
    
    print("\n=== Full Configuration ===")
    config = config_manager.get_config()
    for key, value in config.items():
        print(f"{key}: {value}")
    
    print("\n=== NSN Configuration ===")
    nsn_config = config_manager.get_nsn_config()
    for key, value in nsn_config.items():
        print(f"{key}: {value}")

if __name__ == "__main__":
    test_config_manager()
