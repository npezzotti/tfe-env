#!/usr/bin/env bash

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APT_WAIT="apt-get -o DPkg::Lock::Timeout=120"

# Add Docker's official GPG key:
$APT_WAIT update
$APT_WAIT install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add the Docker repository
tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

$APT_WAIT update

$APT_WAIT install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker ubuntu

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
$APT_WAIT install -y nodejs
node -v && npm -v

setcap 'cap_net_bind_service=+ep' "$(which node)"

echo "Finished provisioning tfe-env server."
