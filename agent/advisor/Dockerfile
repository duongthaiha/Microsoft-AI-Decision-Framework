# Foundry hosted agent image for the Microsoft AI Decision Framework Advisor.
#
# The container speaks the Foundry Responses protocol (port 8088) and runs the
# GitHub Copilot SDK advisor. The Copilot SDK spawns the Copilot CLI, which uses
# the node:sqlite builtin and therefore requires Node.js 24.
#
# IMPORTANT: Foundry hosted agents require linux/amd64 images. Build with:
#   docker build --platform linux/amd64 -t <registry>.azurecr.io/advisor-hosted:<tag> .

FROM node:24-bookworm-slim

# Python 3 + venv (Debian 12 enforces PEP 668; install into an isolated venv).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app

# Install Python dependencies first for better layer caching.
COPY foundry/requirements-hosted.txt /app/requirements-hosted.txt
RUN pip install --upgrade pip \
    && pip install -r /app/requirements-hosted.txt

# Application code and bundled skills (same layout as the local console: skills
# live one level up from the src directory).
COPY src /app/src
COPY skills /app/skills

# A writable home for the Copilot CLI's config/state.
ENV HOME=/app
ENV PYTHONUNBUFFERED=1

# Foundry hosted agents serve on port 8088.
EXPOSE 8088

WORKDIR /app/src
CMD ["python", "foundry_hosted_agent.py"]
