# StockWise — AI-Based Demand Forecasting System for Inventory Optimization

StockWise is a full-stack inventory management platform that uses machine learning
(Random Forest, XGBoost, LSTM, Prophet) to forecast product demand and recommend
optimal stock levels, reducing both stockouts and overstock.

## Features

- Demand forecasting per SKU using multiple ML models (Random Forest, XGBoost, LSTM, Prophet)
- Automatic reorder point and safety stock recommendations
- Role-based dashboards for admins, managers, and staff
- Sales, purchases, and stock movement tracking
- AI chat assistant for natural-language inventory questions
- Analytics and reporting with exportable charts

## Tech Stack

| Layer       | Technology                                              |
|-------------|----------------------------------------------------------|
| Frontend    | React 19, Redux Toolkit, Vite, Tailwind CSS, Recharts     |
| Backend     | Node.js, Express, MongoDB (Mongoose)                      |
| AI Service  | FastAPI, scikit-learn, XGBoost, Prophet, TensorFlow (LSTM)|

## Project Structure

```
.
├── frontend/       # React + Vite SPA
├── server/         # Node.js + Express API
├── ai-service/      # FastAPI ML/forecasting microservice
└── trained_models/  # Serialized model artifacts (gitignored)
```

## Prerequisites

- Node.js >= 18
- Python >= 3.10
- MongoDB (local instance or Atlas connection string)

## Getting Started

### Server Setup

```bash
cd server
npm install
cp .env.example .env   # fill in MongoDB URI, JWT secrets, etc.
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL
npm run dev
```

### AI Service Setup

```bash
cd ai-service
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # set MONGO_URI, LLM API keys (optional)
python main.py
```

## Environment Variables

Each service ships a `.env.example` file documenting the variables it needs
(database URI, JWT secrets, Cloudinary keys, optional LLM API keys). Copy it
to `.env` in the same folder and fill in real values — never commit `.env` files.

## Roadmap

- Expand automated test coverage across all three services
- Add CI pipeline for lint/test on pull requests
- Move large training datasets to Git LFS or external storage

## License

No license has been chosen for this project yet. All rights reserved by the author
unless a LICENSE file is added.
