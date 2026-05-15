"use client";

import { useState } from "react";

export default function Home() {
  const [config, setConfig] = useState({
    host: '127.0.0.1',
    username: 'jefrex',
    password: '78720710',
    command: 'ls -la'
  });
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  const runCommand = async () => {
    setLoading(true);
    setOutput('Connecting...');
    try {
      const res = await fetch('http://10.147.19.249:4000/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await res.json();

      if (!res.ok) {
        setOutput(`Помилка сервера: ${data.error || data.message}`);
      } else {
        setOutput(data.stdout || data.stderr || 'Команда виконана, але відповіді немає.');
      }
    } catch (err) {
      console.error(err);
      setOutput('Мережева помилка (можливо, бекенд вимкнений): ' + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-gray-50">
      <div className="flex flex-col gap-2 w-full max-w-md bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">SSH Web Terminal</h2>
        <input 
          className="border p-2 rounded text-black" 
          placeholder="IP Host" 
          value={config.host} 
          onChange={e => setConfig({...config, host: e.target.value})} 
        />
        <input 
          className="border p-2 rounded text-black" 
          placeholder="Username" 
          value={config.username} 
          onChange={e => setConfig({...config, username: e.target.value})} 
        />
        <input 
          className="border p-2 rounded text-black" 
          type="password" 
          placeholder="Password" 
          value={config.password} 
          onChange={e => setConfig({...config, password: e.target.value})} 
        />
        <input 
          className="border p-2 rounded text-black" 
          placeholder="Command" 
          value={config.command} 
          onChange={e => setConfig({...config, command: e.target.value})} 
        />
        
        <button
          onClick={runCommand}
          disabled={loading}
          className={`mt-4 px-4 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {loading ? 'Executing...' : 'Run Command'}
        </button>
      </div>

      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold mb-2 text-gray-600">Результат:</p>
        <pre className="p-4 bg-black text-green-400 rounded-lg overflow-x-auto min-h-[100px] font-mono shadow-lg">
          {output}
        </pre>
      </div>
    </div>
  );
}