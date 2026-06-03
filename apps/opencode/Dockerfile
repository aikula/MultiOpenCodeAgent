FROM ubuntu:24.04

RUN apt-get update && apt-get install -y curl git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://opencode.ai/install | bash

WORKDIR /workspace

COPY apps/opencode/opencode.json /root/.config/opencode/opencode.json

RUN git config --global user.email "moca@local" && git config --global user.name "MOCA"

ENV OPENCODE_SERVER_PASSWORD=change-me
ENV OPENCODE_SERVER_USERNAME=opencode

EXPOSE 4096

CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
