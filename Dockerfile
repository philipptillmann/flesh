FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_PATH=/app/data/health.sqlite3 PORT=8080 BIND=0.0.0.0
WORKDIR /app
RUN groupadd -g 10001 health && useradd -u 10001 -g health health && mkdir /app/data && chown health:health /app/data
COPY --chown=health:health server.py ops.py ./
COPY --chown=health:health public ./public
USER health
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health')"
CMD ["python", "server.py"]
