FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 CUDA_VISIBLE_DEVICES="" HF_HOME=/data/cache/huggingface
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir 'torch==2.9.1' --index-url https://download.pytorch.org/whl/cpu && python -m pip install --no-cache-dir -r /app/requirements.txt
RUN useradd --create-home --uid 10001 rarebird && mkdir /data && chown rarebird:rarebird /data
COPY --chown=rarebird:rarebird *.py /app/
USER rarebird
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["python", "/app/healthcheck.py", "/data/status.json"]
ENTRYPOINT ["python", "/app/predict.py"]
CMD ["--output", "/data", "--watch", "--publish"]
