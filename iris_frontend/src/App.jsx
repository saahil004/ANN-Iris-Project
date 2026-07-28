import { useState } from 'react';

const FIELDS = [
  { key: 'sepal_length', label: 'Sepal Length (cm)' },
  { key: 'sepal_width', label: 'Sepal Width (cm)' },
  { key: 'petal_length', label: 'Petal Length (cm)' },
  { key: 'petal_width', label: 'Petal Width (cm)' },
];

export default function App() {
  const [form, setForm] = useState({
    sepal_length: '', sepal_width: '', petal_length: '', petal_width: ''
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sepal_length: parseFloat(form.sepal_length),
          sepal_width: parseFloat(form.sepal_width),
          petal_length: parseFloat(form.petal_length),
          petal_width: parseFloat(form.petal_width),
        })
      });
      if (!res.ok) throw new Error('Prediction failed');
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-lg shadow-sm bg-blue-300">
      <h1 className="text-2xl font-bold mb-4">Iris Species Predictor</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input
              type="number"
              step="0.1"
              required
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="border p-2 w-full rounded"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50"
        >
          {loading ? 'Predicting...' : 'Predict'}
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 p-4 border rounded bg-gray-50">
          <p className="font-semibold text-lg">{result.species}</p>
          <p className="text-sm text-gray-600">
            Confidence: {(result.confidence * 100).toFixed(1)}%
          </p>
          <div className="mt-2 space-y-1">
            {Object.entries(result.probabilities).map(([species, prob]) => (
              <div key={species} className="flex justify-between text-sm">
                <span>{species}</span>
                <span>{(prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}