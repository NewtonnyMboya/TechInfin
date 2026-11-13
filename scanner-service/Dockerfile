FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends clamav clamav-freshclam libmagic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENV PORT=8080
EXPOSE 8080
CMD ["./entrypoint.sh"]
