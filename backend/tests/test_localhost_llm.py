import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from srcs.services.agents.rotating_llm import RotatingLLM
from srcs.config import Settings

class TestLocalhostLLM(unittest.TestCase):
    
    @patch('srcs.services.agents.rotating_llm.get_settings')
    @patch('requests.get')
    def test_localhost_llm_detection(self, mock_get, mock_get_settings):
        # Setup mock settings
        mock_settings = MagicMock(spec=Settings)
        mock_settings.LLM_LOCALHOST = True
        mock_settings.LLM_LOCALHOST_URL = "http://localhost:1234/v1"
        mock_get_settings.return_value = mock_settings
        
        # Setup mock response from LM Studio
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": [
                {"id": "test-model-id"}
            ]
        }
        mock_get.return_value = mock_resp
        
        # Create instance
        rllm = RotatingLLM.create_instance_with_env()
        
        # Verify
        self.assertEqual(len(rllm.llm_configs), 1)
        config = rllm.llm_configs[0]
        self.assertEqual(config.provider, "localhost")
        self.assertEqual(config.model, "test-model-id")
        self.assertEqual(config.base_url, "http://localhost:1234/v1")
        print("Verification successful: Localhost model detected correctly.")

    @patch('srcs.services.agents.rotating_llm.get_settings')
    @patch('requests.get')
    def test_localhost_llm_failure(self, mock_get, mock_get_settings):
        # Setup mock settings
        mock_settings = MagicMock(spec=Settings)
        mock_settings.LLM_LOCALHOST = True
        mock_settings.LLM_LOCALHOST_URL = "http://localhost:1234/v1"
        mock_get_settings.return_value = mock_settings
        
        # Setup mock failure
        mock_get.side_effect = Exception("Connection refused")
        
        # Create instance
        rllm = RotatingLLM.create_instance_with_env()
        
        # Verify - should be empty pool because "only use llm localhost"
        self.assertEqual(len(rllm.llm_configs), 0)
        print("Verification successful: Empty pool returned on connection failure.")

if __name__ == "__main__":
    unittest.main()
