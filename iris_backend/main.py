from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import joblib
from tensorflow import keras

app = FastAPI(title="Iris Species Predictor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Load artifacts once at startup ----
model = keras.models.load_model("model/iris_model.keras")
scaler = joblib.load("model/scaler.pkl")
encoder = joblib.load("model/label_encoder.pkl")


class IrisInput(BaseModel):
    sepal_length: float = Field(gt=0, le=20)
    sepal_width: float = Field(gt=0, le=20)
    petal_length: float = Field(gt=0, le=20)
    petal_width: float = Field(gt=0, le=20)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(data: IrisInput):
    try:
        features = np.array([[
            data.sepal_length,
            data.sepal_width,
            data.petal_length,
            data.petal_width
        ]])

        features_scaled = scaler.transform(features)  # reuse train-time stats
        probs = model.predict(features_scaled, verbose=0)[0]
        predicted_idx = int(np.argmax(probs))
        species = encoder.inverse_transform([predicted_idx])[0]

        return {
            "species": species,
            "confidence": float(probs[predicted_idx]),
            "probabilities": {
                encoder.inverse_transform([i])[0]: float(p)
                for i, p in enumerate(probs)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))