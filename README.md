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
