FROM node:20-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai

WORKDIR /workspace

RUN mkdir -p /root/.config/opencode /root/.local/share/opencode
COPY apps/opencode/opencode.json /root/.config/opencode/opencode.json
COPY apps/opencode/skills /opt/opencode-bundled-skills
COPY apps/opencode/auth.json /root/.local/share/opencode/auth.json
COPY apps/opencode/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN git config --global user.email "moca@local" && git config --global user.name "MOCA"

ENV OPENCODE_SERVER_PASSWORD=change-me
ENV OPENCODE_SERVER_USERNAME=opencode

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
