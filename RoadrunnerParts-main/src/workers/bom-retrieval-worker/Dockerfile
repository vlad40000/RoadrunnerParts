FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ensure playwright browsers are installed (though the base image should have them)
RUN playwright install chromium

COPY . .

# Start the worker
CMD ["python", "-m", "worker"]
