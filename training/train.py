import warnings
import pandas as pd
import tensorflow as tf
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from google.protobuf.internal import encoder
from tensorflow import keras
from tensorflow.keras import optimizers, layers
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.linear_model import Perceptron
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.layers import Dense, Dropout

warnings.filterwarnings('ignore')

df = pd.read_csv('Iris.csv')
# print(df.head())

# print(df['Species'].value_counts())

# sns.pairplot(df, hue='Species')
# plt.show()

X = df.drop(columns=['Species', 'Id'])
y = df['Species']

enc = LabelEncoder()
y_encoded = enc.fit_transform(y)
print(y)

X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.33, random_state=42, stratify=y) # stratify keeps the same proportion of classes in both train and test

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

pmodel = Perceptron(
    max_iter=1000, # fwd and bwd prop is 1 iter
    random_state=42
)
pmodel.fit(X_train_scaled, y_train)
y_pred = pmodel.predict(X_test_scaled)

print("Accuracy score: ", accuracy_score(y_test, y_pred))
print("Classification report\n", classification_report(y_test, y_pred))

y_train_cat = to_categorical(y_train, num_classes=3)
# print(y_train_cat)
y_test_cat = to_categorical(y_test, num_classes=3)

model = Sequential([
    Dense(16, input_dim=4, activation='relu'),
    Dense(8, activation='relu'),
    Dense(3, activation='softmax')
])

# opt = optimizers.Adam(learning_rate=0.01, use_ema=True, ema_momentum=0.9)
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

history = model.fit(
    X_train_scaled,
    y_train_cat,
    validation_data=(X_test_scaled, y_test_cat),
    epochs=100,
    batch_size=8,
    verbose=1
)

loss, acc = model.evaluate(X_test_scaled, y_test_cat)
print(acc)

plt.figure(figsize=(10,4))
plt.plot(history.history['accuracy'], label='Train acc')


import joblib

# after training
model.save('iris_model.keras')          # Keras model
joblib.dump(scaler, 'scaler.pkl')        # StandardScaler
joblib.dump(enc, 'label_encoder.pkl')    # LabelEncoder