import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const models = await genAI.listModels();
    const gemini3Models = models.models
      .filter(m => m.name.includes('gemini-3'))
      .map(m => m.name);
    
    console.log('Available Gemini 3 models:', gemini3Models);
  } catch (err) {
    console.error('Error listing models:', err.message);
  }
}

run();
