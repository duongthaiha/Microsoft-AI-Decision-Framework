"""Invoke the deployed Foundry hosted advisor agent end-to-end."""

import os
import sys

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

PROJECT_ENDPOINT = os.environ.get(
    "FOUNDRY_PROJECT_ENDPOINT",
    "https://foundry-project-hd-sc-resource.services.ai.azure.com/api/projects/project-hd-sc",
)
AGENT_NAME = os.environ.get("ADVISOR_AGENT_NAME", "advisor-agent")
PROMPT = " ".join(sys.argv[1:]) or (
    "We want to cut claims triage time. Which Microsoft AI technology should we use?"
)

project = AIProjectClient(
    endpoint=PROJECT_ENDPOINT,
    credential=DefaultAzureCredential(),
    allow_preview=True,
)

client = project.get_openai_client(agent_name=AGENT_NAME)
print(f"Invoking hosted agent '{AGENT_NAME}'...\nPrompt: {PROMPT}\n")
response = client.responses.create(input=PROMPT)
print("=== Advisor response ===")
print(response.output_text)
