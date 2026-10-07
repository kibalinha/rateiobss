import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

export interface MeterOcrResult {
  success: boolean;
  reading: number | null;
  detectedDigits?: string | null;
  meterType?: 'digital' | 'analogico_rolete' | 'analogico_ponteiro' | 'indeterminado';
  confidence: 'high' | 'medium' | 'low';
  explanation?: string;
  error?: string;
  provider: 'qwen' | 'gemini' | 'none';
  modelName: string;
  fallbackUsed?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initGeminiClient();
  }

  private getGeminiApiKey(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env['API_KEY'] && process.env['API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['API_KEY'];
      }
      if (process.env['GEMINI_API_KEY'] && process.env['GEMINI_API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['GEMINI_API_KEY'];
      }
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.process?.env?.API_KEY && w.process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.API_KEY;
      }
      if (w.process?.env?.GEMINI_API_KEY && w.process.env.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.GEMINI_API_KEY;
      }
      if (w.__GEMINI_API_KEY__) {
        return w.__GEMINI_API_KEY__;
      }
      const local = localStorage.getItem('gemini_api_key');
      if (local) return local;
    }
    throw new Error('GEMINI_API_KEY não configurada. Defina a variável de ambiente ou insira a chave nas configurações.');
  }

  private getGroqApiKey(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env['GROQ_API_KEY'] && process.env['GROQ_API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['GROQ_API_KEY'];
      }
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.process?.env?.GROQ_API_KEY && w.process.env.GROQ_API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.GROQ_API_KEY;
      }
      if (w.__GROQ_API_KEY__) {
        return w.__GROQ_API_KEY__;
      }
      const local = localStorage.getItem('groq_api_key');
      if (local) return local;
    }
    throw new Error('GROQ_API_KEY não configurada. Defina a variável de ambiente ou insira a chave nas configurações.');
  }

  private initGeminiClient(): GoogleGenAI {
    if (!this.ai) {
      const apiKey = this.getGeminiApiKey();
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.ai;
  }

  /**
   * Extrai a leitura numérica de consumo de um medidor.
   * ESTRATÉGIA: Prioriza Qwen 3.8 27B (Groq ultra-rápido) -> caso falhe ou não detecte, usa Gemini 3.8 Flash como fallback.
   */
  async extractMeterReading(
    imageBase64: string, 
    utilityType: string = 'luz',
    forceProvider?: 'qwen' | 'gemini'
  ): Promise<MeterOcrResult> {
    if (!imageBase64) {
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: 'Nenhuma imagem fornecida para leitura.',
        provider: 'none',
        modelName: 'None'
      };
    }

    let cleanBase64 = imageBase64;
    let mimeType = 'image/jpeg';

    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
      cleanBase64 = parts[1];
    }

    // Se o usuário forçou especificamente Gemini
    if (forceProvider === 'gemini') {
      return await this.extractWithGemini(cleanBase64, mimeType, utilityType, false);
    }

    // Se o usuário forçou especificamente Qwen
    if (forceProvider === 'qwen') {
      return await this.extractWithQwen(cleanBase64, mimeType, utilityType);
    }

    // FLUXO PADRÃO: 1º Qwen 3.8 27B (Groq) -> 2º Fallback Gemini 3.8 Flash
    try {
      console.log('[OCR Pipeline] Tentativa 1: Executando OCR com Qwen 3.8 27B (Groq)...');
      const qwenResult = await this.extractWithQwen(cleanBase64, mimeType, utilityType);

      if (qwenResult.success && qwenResult.reading !== null) {
        console.log('[OCR Pipeline] Sucesso com Qwen 3.8 27B:', qwenResult.reading);
        return qwenResult;
      }

      console.warn('[OCR Pipeline] Qwen não identificou leitura válida ou retornou erro. Acionando Fallback Gemini 3.8 Flash...');
      const geminiResult = await this.extractWithGemini(cleanBase64, mimeType, utilityType, true);
      return geminiResult;
    } catch (err) {
      console.error('[OCR Pipeline] Erro no Qwen 3.8 27B, acionando Gemini 3.8 Flash Fallback...', err);
      return await this.extractWithGemini(cleanBase64, mimeType, utilityType, true);
    }
  }

  /**
   * Extração de medidor com Qwen 3.8 27B via Groq API
   */
  async extractWithQwen(cleanBase64: string, mimeType: string, utilityType: string): Promise<MeterOcrResult> {
    const groqKey = this.getGroqApiKey();
    if (!groqKey) {
      throw new Error('Chave de API do Groq não configurada.');
    }

    const utilDesc = utilityType === 'luz' 
      ? 'energia elétrica (kWh)' 
      : utilityType === 'agua' 
        ? 'água / hidrômetro (m³)' 
        : 'gás canalizado (m³)';

    const prompt = `
Você é um leitor óptico (OCR) industrial de precisão absoluta para medidores de ${utilDesc} em shopping centers.
Analise a foto deste medidor (relógio analógico de roletes mecânicos ou visor digital LCD/LED).

OBJETIVO:
Identificar o valor numérico acumulado atual de consumo no mostrador.

REGRAS:
1. Extraia APENAS o valor do consumo acumulado principal.
2. IGNORE número de série, ano, modelo, tensão (ex: 220V, 380V), amperagem ou código de barras.
3. Se houver dígitos vermelhos (decimais) no final, foque nos dígitos pretos inteiros ou inclua o valor numérico exato.
4. Se o rolete mecânico estiver entre dois números, use o dígito mais baixo já completado.
5. Responda ESTRITAMENTE em formato JSON com esta estrutura:
{
  "reading": 12345,
  "detectedDigits": "12345",
  "meterType": "digital" | "analogico_rolete" | "analogico_ponteiro" | "indeterminado",
  "confidence": "high" | "medium" | "low",
  "explanation": "Leitura identificada no mostrador principal: 12345"
}

Se o visor estiver ilegível, escuro ou sem medidor visível:
{
  "reading": null,
  "detectedDigits": null,
  "meterType": "indeterminado",
  "confidence": "low",
  "explanation": "Visor do medidor ilegível ou não detectado na foto"
}
`;

    const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 300
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      let num: number | null = null;
      if (typeof parsed.reading === 'number' && !isNaN(parsed.reading)) {
        num = parsed.reading;
      } else if (parsed.detectedDigits) {
        const match = String(parsed.detectedDigits).match(/[\d.]+/);
        if (match) num = parseFloat(match[0]);
      }

      return {
        success: num !== null,
        reading: num,
        detectedDigits: parsed.detectedDigits || (num !== null ? String(num) : null),
        meterType: parsed.meterType || 'indeterminado',
        confidence: parsed.confidence || (num !== null ? 'high' : 'low'),
        explanation: parsed.explanation || (num !== null ? `Leitura ${num} extraída com Qwen 3.8 27B.` : 'Leitura não identificada.'),
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B (Groq)',
        fallbackUsed: false
      };

    } catch (error: any) {
      clearTimeout(timeout);
      console.warn('Falha na chamada ao Qwen 3.8 27B (Groq):', error);
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: error?.message || 'Falha ao processar com Qwen 3.8 27B.',
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B (Groq)',
        fallbackUsed: false
      };
    }
  }

  /**
   * Extração de medidor com Google Gemini 3.8 Flash (Fallback ou Verificação)
   */
  async extractWithGemini(
    cleanBase64: string, 
    mimeType: string, 
    utilityType: string,
    isFallback: boolean = false
  ): Promise<MeterOcrResult> {
    try {
      const client = this.initGeminiClient();

      const utilDesc = utilityType === 'luz' 
        ? 'energia elétrica (kWh)' 
        : utilityType === 'agua' 
          ? 'água / hidrômetro (m³)' 
          : 'gás canalizado (m³)';

      const prompt = `
Você é um leitor óptico (OCR) industrial de alta precisão para medidores de ${utilDesc} em shopping centers.
Analise a imagem deste medidor (relógio analógico de roletes, ponteiros ou display digital LCD/LED).

OBJETIVO PRINCIPAL:
Identificar e extrair com máxima acurácia o número atual acumulado de consumo exibido no display/contador.

REGRAS DE LEITURA:
1. FOQUE EXCLUSIVAMENTE nos roletes/display que indicam a medição acumulada de consumo.
2. IGNORE qualquer número de série, ano de fabricação, código de barras, modelo, tensão (ex: 220V, 380V), amperagem ou constante do disco.
3. Se houver dígitos decimais (ex: dígitos em vermelho ou após a vírgula), extraia o número prioritariamente como inteiro dos dígitos pretos principais ou com a vírgula/ponto se necessário.
4. Se o relógio estiver entre dois números num rolete, considere o dígito mais baixo já ultrapassado (regra padrão de leituristas de utilidades).
5. Responda ESTRITAMENTE em formato JSON compatível com:
{
  "reading": 12345,
  "detectedDigits": "12345",
  "meterType": "digital" | "analogico_rolete" | "analogico_ponteiro" | "indeterminado",
  "confidence": "high" | "medium" | "low",
  "explanation": "Identificado no mostrador de roletes pretos principais: 12345"
}

Se a imagem estiver sem medidor, com desfoque total ou ilegível:
{
  "reading": null,
  "detectedDigits": null,
  "meterType": "indeterminado",
  "confidence": "low",
  "explanation": "Display do medidor ilegível ou não detectado na foto"
}
`;

      const imagePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      };

      const textPart = {
        text: prompt,
      };

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const rawText = response.text || '';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

      try {
        const parsed = JSON.parse(cleanJson);
        let num: number | null = null;
        if (typeof parsed.reading === 'number' && !isNaN(parsed.reading)) {
          num = parsed.reading;
        } else if (parsed.detectedDigits) {
          const match = String(parsed.detectedDigits).match(/[\d.]+/);
          if (match) num = parseFloat(match[0]);
        }

        return {
          success: num !== null,
          reading: num,
          detectedDigits: parsed.detectedDigits || (num !== null ? String(num) : null),
          meterType: parsed.meterType || 'indeterminado',
          confidence: parsed.confidence || (num !== null ? 'medium' : 'low'),
          explanation: parsed.explanation || (num !== null ? `Leitura ${num} extraída com sucesso pelo Gemini.` : 'Leitura não identificada.'),
          provider: 'gemini',
          modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
          fallbackUsed: isFallback
        };
      } catch (e) {
        // Fallback: extração por regex caso o JSON esteja com formatação residual
        const numMatch = rawText.match(/(\d{2,8}(?:\.\d{1,3})?)/);
        if (numMatch) {
          const val = parseFloat(numMatch[1]);
          return {
            success: true,
            reading: val,
            detectedDigits: numMatch[1],
            meterType: 'indeterminado',
            confidence: 'medium',
            explanation: `Leitura aproximada detectada pelo Gemini: ${val}`,
            provider: 'gemini',
            modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
            fallbackUsed: isFallback
          };
        }
        return {
          success: false,
          reading: null,
          confidence: 'low',
          error: 'Não foi possível interpretar a resposta da IA Gemini.',
          provider: 'gemini',
          modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
          fallbackUsed: isFallback
        };
      }

    } catch (error: any) {
      console.error('Erro na extração de leitura com Gemini:', error);
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: error?.message || 'Falha na comunicação com Gemini para leitura do medidor.',
        provider: 'gemini',
        modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
        fallbackUsed: isFallback
      };
    }
  }

  async analyzeRateio(data: any): Promise<string> {
    try {
      const client = this.initGeminiClient();
      const prompt = `
        Você é um especialista em gestão de shopping centers e eficiência energética.
        Analise os dados de rateio abaixo (custos de Água, Luz ou Gás distribuídos entre lojas).
        Identifique anomalias, lojas com consumo desproporcional à sua área (se fornecida) ou categoria, e sugira ações para economia.
        Use formatação Markdown clara. Seja conciso e profissional.
        
        Dados do Rateio:
        ${JSON.stringify(data, null, 2)}
      `;

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Não foi possível gerar a análise.';
    } catch (error) {
      console.error('Erro ao chamar Gemini:', error);
      return 'Erro ao conectar com a IA. Verifique sua chave de API ou tente novamente.';
    }
  }
}