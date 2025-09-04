/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

declare const FFmpeg: any; // FFmpeg is loaded from a script tag

// Type definitions for script structures
interface Scene {
  scene_number: number;
  visual_prompt_english: string;
  duration_seconds: number;
  narration_english: string;
  narration_portuguese: string;
  subtitles_english: string;
}

interface VeoScript {
  scenes: Scene[];
  final_instructions: string;
}

interface GeralScript {
  persona: string;
  tarefa: string;
  contexto: string;
  passos_requisitos: string[];
  formato_saida: string;
  restricoes: string[];
  legendas_sugestao: string;
}

type Script = VeoScript | GeralScript;


// Helper component to render scene cards with an image generation button
const SceneCard = ({
  scene,
  originalVisualPrompt,
  onGenerateImage,
  isGeneratingThisImage,
  onGenerateNarration,
  audioUrl,
  isGeneratingThisNarration,
  isAnyActionInProgress,
}) => {
  return (
    <div className="scene-card">
      <div className="scene-header">
        <h4>Cena {scene.scene_number}</h4>
        <div className="scene-card-actions">
          {audioUrl ? (
            <div className="audio-player-container">
              <audio controls src={audioUrl}></audio>
              <a
                href={audioUrl}
                download={`cena_${scene.scene_number}_narração.wav`}
                className="download-audio-button"
              >
                Baixar Áudio
              </a>
            </div>
          ) : (
            <button
              className="generate-narration-button"
              onClick={() => onGenerateNarration(scene)}
              disabled={isAnyActionInProgress}
            >
              {isGeneratingThisNarration ? (
                <div className="loader-small" />
              ) : null}
              {isGeneratingThisNarration ? "Gerando..." : "Gerar Narração"}
            </button>
          )}

          <button
            className="generate-image-button"
            onClick={() => onGenerateImage(originalVisualPrompt)}
            disabled={isAnyActionInProgress}
          >
            {isGeneratingThisImage ? <div className="loader-small" /> : null}
            {isGeneratingThisImage ? "Gerando..." : "Gerar Imagem"}
          </button>
        </div>
      </div>
      <p>
        <strong>Visual:</strong> {scene.visual_prompt_english}
      </p>
      {scene.narration_portuguese && (
        <p>
          <strong>Narração (PT-BR):</strong> {scene.narration_portuguese}
        </p>
      )}
      <p>
        <strong>Narração (EN):</strong> {scene.narration_english}
      </p>
      <p>
        <strong>Legendas (EN):</strong> {scene.subtitles_english}
      </p>
      <p>
        <strong>Duração:</strong> {scene.duration_seconds}s
      </p>
    </div>
  );
};

const App = () => {
  const [mainTab, setMainTab] = useState<'generation' | 'editing'>('generation');
  // Generation Tab State
  const [inputMode, setInputMode] = useState<"video" | "text" | "image" | "url">(
    "video"
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [mainTextInstruction, setMainTextInstruction] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [targetModel, setTargetModel] = useState("veo");
  const [generatedPrompt, setGeneratedPrompt] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Summary State
  const [generatedPromptSummary, setGeneratedPromptSummary] = useState<{
    en: string;
    pt: string;
  } | null>(null);
  const [transformedPromptSummary, setTransformedPromptSummary] = useState<{
    en: string;
    pt: string;
  } | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<string | null>(null);


  // Transformation state
  const [transformationInstructions, setTransformationInstructions] =
    useState("");
  const [transformedPrompt, setTransformedPrompt] = useState<Script | null>(
    null
  );
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformationError, setTransformationError] = useState<string | null>(
    null
  );
  const [transformedCopied, setTransformedCopied] = useState(false);

  // Concept Art state
  const [isGeneratingConceptArt, setIsGeneratingConceptArt] = useState(false);
  const [conceptArt, setConceptArt] = useState<{
    src: string;
    prompt: string;
  } | null>(null);
  const [conceptArtError, setConceptArtError] = useState<string | null>(null);

  // Image generation state
  const [generatedImages, setGeneratedImages] = useState<
    { prompt: string; src: string }[]
  >([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState<string | null>(
    null
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageCoherence, setImageCoherence] = useState("");
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Video generation state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenerationError, setVideoGenerationError] = useState<
    string | null
  >(null);
  const [generatedVideos, setGeneratedVideos] = useState<
    { url: string; sceneNumber: number }[]
  >([]);
  const [
    videoGenerationProgress,
    setVideoGenerationProgress,
  ] = useState<{ current: number; total: number; message: string } | null>(
    null
  );

  // Narration audio state
  const [generatedAudios, setGeneratedAudios] = useState<{
    [key: number]: string;
  }>({});
  const [isGeneratingNarration, setIsGeneratingNarration] = useState<
    number | null
  >(null);
  const [
    isGeneratingAllNarrations,
    setIsGeneratingAllNarrations,
  ] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  // Audio Extraction State
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [extractedAudioUrl, setExtractedAudioUrl] = useState<string | null>(
    null
  );
  const [audioExtractionError, setAudioExtractionError] = useState<
    string | null
  >(null);

  // Editing Tab State
  const [editingVideoFiles, setEditingVideoFiles] = useState<File[]>([]);
  const [editingAudioFile, setEditingAudioFile] = useState<File | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergingError, setMergingError] = useState<string | null>(null);
  const editingVideoInputRef = useRef<HTMLInputElement>(null);
  const editingAudioInputRef = useRef<HTMLInputElement>(null);
  
  // FFmpeg State
  const ffmpegRef = useRef<any>(null);
  const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return;
    try {
        setProcessingLog(prev => [...prev, 'Carregando FFmpeg (pode levar um momento)...']);
        const ffmpeg = new FFmpeg.FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            console.log(message);
        });
        ffmpeg.on('progress', ({ progress }) => {
            setProcessingProgress(Math.round(progress * 100));
        });
        await ffmpeg.load({
            coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js'
        });
        ffmpegRef.current = ffmpeg;
        setIsFfmpegLoaded(true);
        setProcessingLog(prev => [...prev, 'FFmpeg carregado com sucesso.']);
    } catch (err) {
        console.error("Failed to load ffmpeg:", err);
        setMergingError("Falha ao carregar o componente de edição de vídeo. Tente recarregar a página.");
    }
  };

  useEffect(() => {
    if (mainTab === 'editing' && !isFfmpegLoaded) {
      loadFFmpeg();
    }
  }, [mainTab, isFfmpegLoaded]);


  const handleModeChange = (mode: "video" | "text" | "image" | "url") => {
    setInputMode(mode);
    setVideoFile(null);
    setImageFile(null);
    setMainTextInstruction("");
    setUrlInput("");
    setError(null);
    setExtractedAudioUrl(null);
    setAudioExtractionError(null);
  };

  const getModelConfig = useCallback(
    (model: string, inputMode: "video" | "text" | "image" | "url") => {
      if (model === "veo") {
        let systemInstruction = "";
        const optimizationInstruction = `A critical requirement is to divide the script into scenes with a maximum duration of 8 seconds each, as this is the limit for the VEO3 model. Your main goal is to optimize the script by creating as many 8-second scenes as possible to minimize the total number of scenes. For example, a 30-second concept should be divided into three 8-second scenes and one 6-second scene, not five 6-second scenes.`;

        if (inputMode === "video") {
          systemInstruction = `You are an expert scriptwriter for AI video generation models like VEO. Your task is to analyze the provided video and create a detailed, scene-by-scene script in JSON format based on its content. ${optimizationInstruction} The script's primary language for visual prompts, narration, and subtitles must be English. Crucially, you must also provide a Brazilian Portuguese translation for the narration of each scene in a separate JSON field. Finally, include a specific instruction for the video generation model to produce the final audio and subtitles in Brazilian Portuguese. Base the script on the user's video and any additional instructions they provide.`;
        } else if (inputMode === "image") {
          systemInstruction = `You are an expert scriptwriter for AI video generation models like VEO. Your task is to analyze the provided static image and create a detailed, scene-by-scene script in JSON format based on its content. Imagine the image is a single frame from a larger story. Create a narrative around it. ${optimizationInstruction} The script's primary language for visual prompts, narration, and subtitles must be English. Crucially, you must also provide a Brazilian Portuguese translation for the narration of each scene in a separate JSON field. Finally, include a specific instruction for the video generation model to produce the final audio and subtitles in Brazilian Portuguese. Base the script on the user's image and any additional instructions they provide.`;
        } else if (inputMode === "url") {
            systemInstruction = `You are an expert scriptwriter for AI video generation models like VEO. Your task is to create a detailed, scene-by-scene script in JSON format based on the content of the provided URL and the user's instructions. ${optimizationInstruction} The script's primary language for visual prompts, narration, and subtitles must be English. Crucially, you must also provide a Brazilian Portuguese translation for the narration of each scene in a separate JSON field. Finally, include a specific instruction for the video generation model to produce the final audio and subtitles in Brazilian Portuguese. Base the script on the user's instructions and the URL content.`;
        } else {
          // text
          systemInstruction = `You are an expert scriptwriter for AI video generation models like VEO. Your task is to create a detailed, scene-by-scene script in JSON format based on the user's instructions. ${optimizationInstruction} The script's primary language for visual prompts, narration, and subtitles must be English. Crucially, you must also provide a Brazilian Portuguese translation for the narration of each scene in a separate JSON field. Finally, include a specific instruction for the video generation model to produce the final audio and subtitles in Brazilian Portuguese. Base the script on the user's instructions.`;
        }
        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            scenes: {
              type: Type.ARRAY,
              description: "An array of scenes for the video.",
              items: {
                type: Type.OBJECT,
                properties: {
                  scene_number: {
                    type: Type.INTEGER,
                    description: "The sequential number of the scene.",
                  },
                  visual_prompt_english: {
                    type: Type.STRING,
                    description:
                      "A detailed visual description of the scene in English for the video generation model.",
                  },
                  duration_seconds: {
                    type: Type.INTEGER,
                    description:
                      "Duration of the scene in seconds. It must be at most 8 seconds. Prioritize making scenes exactly 8 seconds long to optimize the total number of scenes.",
                  },
                  narration_english: {
                    type: Type.STRING,
                    description:
                      "The narration script for this scene in English.",
                  },
                  narration_portuguese: {
                    type: Type.STRING,
                    description:
                      "The narration script for this scene in Brazilian Portuguese.",
                  },
                  subtitles_english: {
                    type: Type.STRING,
                    description:
                      "The subtitles for this scene in English, matching the narration.",
                  },
                },
                required: [
                  "scene_number",
                  "visual_prompt_english",
                  "duration_seconds",
                  "narration_english",
                  "narration_portuguese",
                  "subtitles_english",
                ],
              },
            },
            final_instructions: {
              type: Type.STRING,
              description:
                "Final instructions for the video model. Must be in English.",
              example:
                "The final video's audio track and subtitles must be generated in Brazilian Portuguese.",
            },
          },
          required: ["scenes", "final_instructions"],
        };
        return { systemInstruction, responseSchema };
      } else {
        // 'geral' model
        let systemInstruction = "";
        if (inputMode === "video") {
          systemInstruction = `Sua tarefa é analisar o vídeo fornecido e transformá-lo em um prompt detalhado para um modelo de IA generativa de vídeo, estruturado como um objeto JSON. O JSON deve incluir uma persona, a tarefa, contexto, requisitos, formato de saída, restrições e legendas em português para o vídeo a ser gerado, tudo baseado no conteúdo do vídeo e nas instruções do usuário.`;
        } else if (inputMode === "image") {
          systemInstruction = `Sua tarefa é analisar a imagem fornecida e transformá-la em um prompt detalhado para um modelo de IA generativa de vídeo, estruturado como um objeto JSON. O JSON deve incluir uma persona, a tarefa, contexto, requisitos, formato de saída, restrições e legendas em português para o vídeo a ser gerado, tudo baseado no conteúdo da imagem e nas instruções do usuário.`;
        } else if (inputMode === "url") {
            systemInstruction = `Sua tarefa é analisar o conteúdo da URL fornecida e transformá-lo em um prompt detalhado para um modelo de IA generativa de vídeo, estruturado como um objeto JSON. O JSON deve incluir uma persona, a tarefa, contexto, requisitos, formato de saída, restrições e legendas em português para o vídeo a ser gerado, tudo baseado no conteúdo da URL e nas instruções do usuário.`;
        } else {
          // text
          systemInstruction = `Sua tarefa é criar um prompt detalhado para um modelo de IA generativa de vídeo, estruturado como um objeto JSON, baseado nas instruções do usuário. O JSON deve incluir uma persona, a tarefa, contexto, requisitos, formato de saída, restrições e legendas em português para o vídeo a ser gerado.`;
        }
        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            persona: {
              type: Type.STRING,
              description: "A persona que a IA deve assumir.",
            },
            tarefa: {
              type: Type.STRING,
              description: "A tarefa principal a ser executada.",
            },
            contexto: {
              type: Type.STRING,
              description: "Informações de fundo relevantes.",
            },
            passos_requisitos: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Passos ou requisitos para a tarefa.",
            },
            formato_saida: {
              type: Type.STRING,
              description: "O formato esperado da saída.",
            },
            restricoes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Restrições ou limitações a serem consideradas.",
            },
            legendas_sugestao: {
              type: Type.STRING,
              description: "Sugestão de legendas em português para o vídeo.",
            },
          },
          required: [
            "persona",
            "tarefa",
            "contexto",
            "passos_requisitos",
            "formato_saida",
            "restricoes",
            "legendas_sugestao",
          ],
        };
        return { systemInstruction, responseSchema };
      }
    },
    []
  );

  const fileToUint8Array = (file: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                resolve(new Uint8Array(event.target.result as ArrayBuffer));
            } else {
                reject(new Error("Failed to read file."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = (error) => reject(error);
    });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setVideoFile(event.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("drag-over");
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      setVideoFile(event.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add("drag-over");
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("drag-over");
  };

  const removeFile = () => {
    setVideoFile(null);
    setExtractedAudioUrl(null);
    setAudioExtractionError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files && event.target.files[0]) {
      setImageFile(event.target.files[0]);
      setError(null);
    }
  };

  const handleImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("drag-over");
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      setImageFile(event.dataTransfer.files[0]);
      setError(null);
    }
  };

  const removeImageFile = () => {
    setImageFile(null);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = "";
    }
  };

  const generateScriptSummary = async (
    scriptObject: Script
  ): Promise<{ en: string; pt: string } | null> => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      let totalDuration = 0;
      let sceneCount = 0;
      if (
        scriptObject &&
        "scenes" in scriptObject &&
        Array.isArray((scriptObject as VeoScript).scenes)
      ) {
        const veoScript = scriptObject as VeoScript;
        totalDuration = veoScript.scenes.reduce(
          (acc, scene) => acc + scene.duration_seconds,
          0
        );
        sceneCount = veoScript.scenes.length;
      }

      const systemInstruction = `You are an expert in creating directive video generation prompts. Based on the provided JSON script, your task is to create a new command prompt that acts as a technical summary.

The Brazilian Portuguese prompt MUST begin with 'Crie um vídeo de ${totalDuration} segundos, com áudio em português do Brasil.'.
The English prompt MUST begin with 'Create a ${totalDuration}-second video, with audio in Brazilian Portuguese.'.

Following that, for both languages, concisely add technical details extracted from the script, such as:
- The visual style (e.g., '3D animation', 'live-action cinematic shot').
- A brief description of the required narration or speech.
- Mention key elements like 3D details or special effects.

The goal is to create a very brief, technical, and directive summary for recreating the video. Your output must be a JSON object.`;

      const summaryResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Here is the script JSON: ${JSON.stringify(
          scriptObject
        )}`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary_english: {
                type: Type.STRING,
                description: "A directive and technical summary in English.",
              },
              summary_portuguese: {
                type: Type.STRING,
                description:
                  "Um resumo diretivo e técnico em Português do Brasil.",
              },
            },
            required: ["summary_english", "summary_portuguese"],
          },
        },
      });
      const parsedSummary = JSON.parse(summaryResponse.text.trim());
      return {
        en: parsedSummary.summary_english,
        pt: parsedSummary.summary_portuguese,
      };
    } catch (err) {
      console.error("Failed to generate script summary:", err);
      return null;
    }
  };


  const handleGeneratePrompt = async () => {
    if (
      (inputMode === "video" && !videoFile) ||
      (inputMode === "text" && !mainTextInstruction) ||
      (inputMode === "image" && !imageFile) ||
      (inputMode === "url" && !urlInput)
    ) {
      setError(
        "Por favor, forneça a entrada necessária (vídeo, imagem, URL ou texto)."
      );
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedPrompt(null);
    setGeneratedPromptSummary(null);
    setTransformedPrompt(null);
    setTransformedPromptSummary(null);
    setGeneratedImages([]);
    setImageCoherence("");
    setGeneratedVideos([]);
    setGeneratedAudios({});
    setExtractedAudioUrl(null);
    setAudioExtractionError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const { systemInstruction, responseSchema } = getModelConfig(
        targetModel,
        inputMode
      );

      const parts: (
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      )[] = [
        {
          text:
            inputMode === "video"
              ? `Analise este vídeo e siga as instruções adicionais: ${additionalInstructions}`
              : inputMode === "image"
              ? `Analise esta imagem e siga as instruções adicionais: ${additionalInstructions}`
              : inputMode === "url"
              ? `Analise o conteúdo desta URL: ${urlInput}\n\nInstruções adicionais: ${additionalInstructions}`
              : `Siga estas instruções: ${mainTextInstruction}\n\nInstruções adicionais: ${additionalInstructions}`,
        },
      ];

      if (inputMode === "video" && videoFile) {
        const videoBase64 = await fileToBase64(videoFile);
        parts.push({
          inlineData: {
            mimeType: videoFile.type,
            data: videoBase64,
          },
        });
      } else if (inputMode === "image" && imageFile) {
        const imageBase64 = await fileToBase64(imageFile);
        parts.push({
          inlineData: {
            mimeType: imageFile.type,
            data: imageBase64,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const jsonString = response.text.trim();
      const parsedJson = JSON.parse(jsonString);
      setGeneratedPrompt(parsedJson);

      const summary = await generateScriptSummary(parsedJson);
      if (summary) {
        setGeneratedPromptSummary(summary);
      }
    } catch (err: any) {
      console.error("Error generating prompt:", err);
      setError(
        `Ocorreu um erro ao gerar o roteiro: ${
          err.message || "Tente novamente."
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateConceptArt = async () => {
    if (
      (inputMode === "video" && !videoFile) ||
      (inputMode === "text" && !mainTextInstruction) ||
      (inputMode === "image" && !imageFile) ||
      (inputMode === "url" && !urlInput)
    ) {
      setConceptArtError(
        "Por favor, forneça a entrada necessária (vídeo, imagem, URL ou texto) antes de gerar a arte."
      );
      return;
    }
    setIsGeneratingConceptArt(true);
    setConceptArtError(null);
    setConceptArt(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      // Step 1: Generate a detailed prompt from the video/text/image
      const promptGenerationSystemInstruction =
        "You are a visual artist expert. Based on the provided input (video, image, URL, or text), create a single, highly detailed and cinematic prompt for an image generation AI. Describe the style, mood, color palette, key subjects, and environment to capture the essence of the input in one compelling image.";

      const parts: (
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      )[] = [
        {
          text:
            inputMode === "video"
              ? "Analyze this video."
              : inputMode === "image"
              ? "Analyze this image."
              : inputMode === "url"
              ? `Analyze the content of this URL: ${urlInput}`
              : mainTextInstruction,
        },
      ];

      if (inputMode === "video" && videoFile) {
        const videoBase64 = await fileToBase64(videoFile);
        parts.push({
          inlineData: {
            mimeType: videoFile.type,
            data: videoBase64,
          },
        });
      } else if (inputMode === "image" && imageFile) {
        const imageBase64 = await fileToBase64(imageFile);
        parts.push({
          inlineData: {
            mimeType: imageFile.type,
            data: imageBase64,
          },
        });
      }

      const promptResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: { systemInstruction: promptGenerationSystemInstruction },
      });
      const imagePrompt = promptResponse.text;

      // Step 2: Generate the image using the new prompt
      const imageResponse = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "16:9",
        },
      });

      const base64ImageBytes: string =
        imageResponse.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      setConceptArt({ src: imageUrl, prompt: imagePrompt });
    } catch (err: any) {
      console.error("Concept art generation failed:", err);
      setConceptArtError(
        `Falha ao gerar arte conceitual: ${err.message || "Tente novamente."}`
      );
    } finally {
      setIsGeneratingConceptArt(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    if (type === "original") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (type === "transformed") {
      setTransformedCopied(true);
      setTimeout(() => setTransformedCopied(false), 2000);
    } else {
      setCopiedSummary(type);
      setTimeout(() => setCopiedSummary(null), 2000);
    }
  };

  const renderScript = (scriptObject) => {
    if (!scriptObject) return null;
    return (
      <pre>
        <code>{JSON.stringify(scriptObject, null, 2)}</code>
      </pre>
    );
  };

  const handleTransformPrompt = async () => {
    if (!generatedPrompt || !transformationInstructions) {
      setTransformationError(
        "É necessário ter um roteiro gerado e instruções de transformação."
      );
      return;
    }
    setIsTransforming(true);
    setTransformationError(null);
    setTransformedPrompt(null);
    setTransformedPromptSummary(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const { responseSchema } = getModelConfig(targetModel, inputMode);

      const systemInstruction = `You are an expert script editor. Your task is to modify the provided JSON script based on the user's instructions. You MUST maintain the original JSON structure and all its fields. Only change the content of the fields as requested by the user. The entire script must remain in English.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Original Script: ${JSON.stringify(
          generatedPrompt,
          null,
          2
        )}\n\nModification Instructions: ${transformationInstructions}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const jsonString = response.text.trim();
      const parsedJson = JSON.parse(jsonString);
      setTransformedPrompt(parsedJson);

      const summary = await generateScriptSummary(parsedJson);
      if (summary) {
        setTransformedPromptSummary(summary);
      }
    } catch (err: any) {
      console.error("Error transforming prompt:", err);
      setTransformationError(
        `Ocorreu um erro ao transformar o roteiro: ${
          err.message || "Tente novamente."
        }`
      );
    } finally {
      setIsTransforming(false);
    }
  };

  const handleGenerateImage = async (prompt) => {
    setIsGeneratingImage(prompt);
    setImageError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const imageResponse = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: imageCoherence
          ? `${imageCoherence}. Scene: ${prompt}`
          : prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "16:9",
        },
      });

      const base64ImageBytes =
        imageResponse.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      setGeneratedImages((prev) => [...prev, { src: imageUrl, prompt }]);
    } catch (err: any) {
      console.error("Image generation failed:", err);
      setImageError(
        `Falha ao gerar imagem: ${err.message || "Tente novamente."}`
      );
    } finally {
      setIsGeneratingImage(null);
    }
  };

  const handleGenerateAllImages = async (script: VeoScript) => {
    if (!script || !script.scenes) return;
    setIsGeneratingAll(true);

    for (const scene of script.scenes) {
      await handleGenerateImage(scene.visual_prompt_english);
    }

    setIsGeneratingAll(false);
  };

  const handleGenerateFullVideo = async (script: VeoScript) => {
    if (!script || !script.scenes || script.scenes.length === 0) {
      setVideoGenerationError(
        "Nenhuma cena encontrada no roteiro para gerar o vídeo."
      );
      return;
    }

    // Validation for VEO3 8-second limit
    const longScenes = script.scenes.filter((s) => s.duration_seconds > 8);
    if (longScenes.length > 0) {
      setVideoGenerationError(
        `Erro: A(s) cena(s) ${longScenes
          .map((s) => s.scene_number)
          .join(", ")} excedem o limite de 8 segundos do VEO3.`
      );
      return;
    }

    setIsGeneratingVideo(true);
    setVideoGenerationError(null);
    setGeneratedVideos([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      // Step 1: Create a master style guide for the whole video
      setVideoGenerationProgress({
        current: 0,
        total: script.scenes.length + 2,
        message: "Analisando roteiro para criar um estilo visual...",
      });
      const styleGuidePrompt = `Based on the following script scenes, create a "master style guide" for a video director. This guide should define the overall visual identity, including camera style (e.g., handheld, static, cinematic), color grading (e.g., vibrant, muted, high-contrast), pacing (e.g., fast-paced, slow and deliberate), and mood (e.g., dramatic, upbeat, mysterious). This guide will ensure all generated video clips feel consistent. Script: ${JSON.stringify(
        script.scenes.map((s) => s.visual_prompt_english)
      )}`;

      const styleGuideResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: styleGuidePrompt,
      });
      const styleGuide = styleGuideResponse.text;

      // Step 2: Generate video for each scene
      const allGeneratedVideos = [];
      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i];
        setVideoGenerationProgress({
          current: i + 1,
          total: script.scenes.length,
          message: `Processando vídeo da cena ${scene.scene_number} (${i + 1}/${
            script.scenes.length
          })...`,
        });

        // Step 2a: Create a cinematic prompt for the specific scene
        const cinematicPromptSystemInstruction = `You are a creative video director. Using the provided "Master Style Guide" and the specific scene description, write a detailed, cinematic prompt for a video generation AI. Describe camera shots (e.g., "Medium shot of... tracking left"), character actions, and key visual elements. Do NOT just repeat the scene description; interpret it cinematically.`;

        const cinematicPromptResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Master Style Guide: ${styleGuide}\n\nScene ${scene.scene_number} Description: ${scene.visual_prompt_english}`,
          config: { systemInstruction: cinematicPromptSystemInstruction },
        });
        const finalVideoPrompt = cinematicPromptResponse.text;

        // Step 2b: Generate the video
        let operation = await ai.models.generateVideos({
          model: "veo-2.0-generate-001",
          prompt: finalVideoPrompt,
          config: {
            numberOfVideos: 1,
          },
        });

        while (!operation.done) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          operation = await ai.operations.getVideosOperation({
            operation: operation,
          });
        }

        const downloadLink =
          operation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
          allGeneratedVideos.push({
            url: `${downloadLink}&key=${process.env.API_KEY}`,
            sceneNumber: scene.scene_number,
          });
          setGeneratedVideos([...allGeneratedVideos]);
        } else {
          throw new Error(
            `Falha ao obter o link de download para a cena ${scene.scene_number}.`
          );
        }
      }
    } catch (err: any) {
      console.error("Video generation failed:", err);
      setVideoGenerationError(
        `Falha ao gerar vídeos: ${err.message || "Tente novamente."}`
      );
    } finally {
      setIsGeneratingVideo(false);
      setVideoGenerationProgress(null);
    }
  };

  // Function to create a silent WAV file data URL.
  // This simulates receiving an audio file from an API.
  const createSilentWavDataUrl = (durationSeconds: number): string => {
    const sampleRate = 44100;
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = Math.round(durationSeconds * byteRate);
    const fileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Sub-chunk size
    view.setUint16(20, 1, true); // Audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // Bits per sample

    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    // Convert buffer to base64
    const binary = String.fromCharCode.apply(
      null,
      Array.from(new Uint8Array(buffer))
    );
    const base64 = btoa(binary);

    return `data:audio/wav;base64,${base64}`;
  };

  const handleGenerateNarration = async (scene) => {
    setNarrationError(null);
    setIsGeneratingNarration(scene.scene_number);
    try {
      // Simulate API call to generate audio with Gemini Speak
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const audioDataUrl = createSilentWavDataUrl(scene.duration_seconds || 5);

      setGeneratedAudios((prev) => ({
        ...prev,
        [scene.scene_number]: audioDataUrl,
      }));
    } catch (err: any) {
      setNarrationError(
        `Erro ao gerar narração para cena ${scene.scene_number}: ${err.message}`
      );
    } finally {
      setIsGeneratingNarration(null);
    }
  };

  const handleGenerateAllNarrations = async (script: VeoScript) => {
    if (!script || !script.scenes) return;
    setIsGeneratingAllNarrations(true);
    setNarrationError(null);

    // Using a for...of loop to process scenes sequentially
    for (const scene of script.scenes) {
      // Don't re-generate if audio already exists
      if (!generatedAudios[scene.scene_number]) {
        await handleGenerateNarration(scene);
      }
    }
    setIsGeneratingAllNarrations(false);
  };

  // Helper function to convert an AudioBuffer to a WAV file Blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const newBuffer = new ArrayBuffer(length);
    const view = new DataView(newBuffer);
    const channels = [];
    let pos = 0;

    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // RIFF header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"

    // "fmt " sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    // "data" sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 0;
    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        const sample = Math.max(-1, Math.min(1, channels[i][offset] || 0));
        const intSample =
          sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, intSample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([view], { type: "audio/wav" });
  };

  const handleExtractAudio = async () => {
    if (!videoFile) {
      setAudioExtractionError("Nenhum arquivo de vídeo selecionado.");
      return;
    }
    setIsExtractingAudio(true);
    setExtractedAudioUrl(null);
    setAudioExtractionError(null);

    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const arrayBuffer = await videoFile.arrayBuffer();

      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioContext.decodeAudioData(arrayBuffer, resolve, reject);
      });

      const wavBlob = audioBufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      setExtractedAudioUrl(url);
    } catch (err) {
      console.error("Audio extraction failed:", err);
      setAudioExtractionError(
        "Falha ao extrair o áudio. O formato do vídeo pode não ser suportado pelo navegador."
      );
    } finally {
      setIsExtractingAudio(false);
    }
  };

  // Editing Tab Handlers
  const handleEditingVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setEditingVideoFiles(files);
      setMergingError(null);
      setMergedVideoUrl(null);
    }
  };

  const handleEditingAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEditingAudioFile(e.target.files[0]);
      setMergingError(null);
      setMergedVideoUrl(null);
    }
  };

  const removeEditingVideo = (indexToRemove: number) => {
    const newFiles = editingVideoFiles.filter((_, index) => index !== indexToRemove);
    setEditingVideoFiles(newFiles);
  };
  
  const removeEditingAudio = () => {
    setEditingAudioFile(null);
    if(editingAudioInputRef.current) {
      editingAudioInputRef.current.value = "";
    }
    setMergedVideoUrl(null);
  };

  const handleMergeVideos = async () => {
    if (editingVideoFiles.length === 0 || !editingAudioFile) {
      setMergingError("Por favor, envie pelo menos um vídeo e um arquivo de áudio.");
      return;
    }
    if (!isFfmpegLoaded || !ffmpegRef.current) {
      setMergingError("O editor de vídeo ainda está carregando. Por favor, aguarde.");
      return;
    }

    setIsMerging(true);
    setMergingError(null);
    setMergedVideoUrl(null);
    setProcessingProgress(0);
    setProcessingLog(['Iniciando processo...']);

    const ffmpeg = ffmpegRef.current;
    
    try {
      // 1. Write video and audio files to FFmpeg's virtual file system
      setProcessingLog(prev => [...prev, 'Escrevendo arquivos de vídeo e áudio...']);
      const videoFileNames = [];
      for (let i = 0; i < editingVideoFiles.length; i++) {
        const file = editingVideoFiles[i];
        const data = await fileToUint8Array(file);
        const fileName = `input${i}.mp4`;
        await ffmpeg.writeFile(fileName, data);
        videoFileNames.push(fileName);
      }
      const audioData = await fileToUint8Array(editingAudioFile);
      const audioFileName = `audio.${editingAudioFile.name.split('.').pop()}`;
      await ffmpeg.writeFile(audioFileName, audioData);

      // 2. Create a file list for concatenation
      const fileListContent = videoFileNames.map(name => `file '${name}'`).join('\n');
      await ffmpeg.writeFile('mylist.txt', fileListContent);
      
      // 3. Run FFmpeg command
      setProcessingLog(prev => [...prev, 'Combinando clipes de vídeo...']);
      const command = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'mylist.txt', // Input from the file list
        '-i', audioFileName,   // Audio input
        '-c:v', 'copy',      // Copy video stream without re-encoding (faster)
        '-c:a', 'aac',       // Re-encode audio to a standard format
        '-map', '0:v:0',       // Map video from the first input (concatenated videos)
        '-map', '1:a:0',       // Map audio from the second input (new audio file)
        '-shortest',         // Finish encoding when the shortest input stream ends
        'output.mp4'
      ];
      await ffmpeg.exec(command);
      setProcessingLog(prev => [...prev, 'Renderização completa.']);

      // 4. Read the result
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setMergedVideoUrl(url);

    } catch (err) {
      console.error("FFmpeg processing error:", err);
      setMergingError("Ocorreu um erro durante o processamento do vídeo. Verifique o console para mais detalhes.");
    } finally {
      setIsMerging(false);
    }
  };


  const currentScript = transformedPrompt || generatedPrompt;
  const showTwoColumns = useMemo(
    () =>
      (generatedPrompt && !transformedPrompt) ||
      (generatedPrompt && transformedPrompt),
    [generatedPrompt, transformedPrompt]
  );
  const isAnyActionInProgress =
    isGeneratingAll ||
    isGeneratingImage !== null ||
    isGeneratingAllNarrations ||
    isGeneratingNarration !== null ||
    isGeneratingVideo;

  return (
    <div className="container">
      <header>
        <h1>Gerador e Editor de Roteiros</h1>
         <div className="main-tab-switcher">
            <button className={`main-tab-button ${mainTab === 'generation' ? 'active' : ''}`} onClick={() => setMainTab('generation')}>
                Geração
            </button>
            <button className={`main-tab-button ${mainTab === 'editing' ? 'active' : ''}`} onClick={() => setMainTab('editing')}>
                Edição
            </button>
        </div>
        <p>
            {mainTab === 'generation' 
                ? 'Gere roteiros detalhados a partir de vídeo, imagem ou texto.' 
                : 'Junte múltiplos vídeos e adicione uma trilha sonora personalizada.'}
        </p>
      </header>
      
      {mainTab === 'generation' && (
        <>
        <div className="input-section">
          <div className="input-mode-switcher">
            <button
              className={`mode-button ${inputMode === "video" ? "active" : ""}`}
              onClick={() => handleModeChange("video")}
            >
              Gerar com Vídeo
            </button>
            <button
              className={`mode-button ${inputMode === "image" ? "active" : ""}`}
              onClick={() => handleModeChange("image")}
            >
              Gerar com Imagem
            </button>
            <button
              className={`mode-button ${inputMode === "url" ? "active" : ""}`}
              onClick={() => handleModeChange("url")}
            >
              Gerar com URL
            </button>
            <button
              className={`mode-button ${inputMode === "text" ? "active" : ""}`}
              onClick={() => handleModeChange("text")}
            >
              Gerar com Texto
            </button>
          </div>
  
          {inputMode === "video" && (
            <>
              <div
                className="drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*"
                  style={{ display: "none" }}
                />
                {videoFile ? (
                  <div className="file-info">
                    <span className="file-name">{videoFile.name}</span>
                    <span className="file-size">
                      {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                      className="copy-button"
                      style={{ marginTop: "8px" }}
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <p className="drop-zone-text">
                    Arraste e solte um vídeo aqui, ou clique para selecionar
                  </p>
                )}
              </div>
              {videoFile && (
                <div className="audio-extraction-section">
                  <button
                    onClick={handleExtractAudio}
                    className="generate-button secondary"
                    disabled={isExtractingAudio}
                  >
                    {isExtractingAudio ? <div className="loader" /> : null}
                    {isExtractingAudio
                      ? "Extraindo..."
                      : "Extrair Áudio do Vídeo"}
                  </button>
                  {audioExtractionError && (
                    <div className="error-message small">
                      {audioExtractionError}
                    </div>
                  )}
                  {extractedAudioUrl && (
                    <div className="extracted-audio-player">
                      <p>Áudio extraído com sucesso:</p>
                      <audio controls src={extractedAudioUrl}></audio>
                      <a
                        href={extractedAudioUrl}
                        download={`${videoFile.name
                          .split(".")
                          .slice(0, -1)
                          .join(".")}_audio.wav`}
                        className="download-audio-button"
                      >
                        Baixar Áudio
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
  
          {inputMode === "image" && (
            <div
              className="drop-zone"
              onClick={() => imageFileInputRef.current?.click()}
              onDrop={handleImageDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                ref={imageFileInputRef}
                onChange={handleImageFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
              {imageFile ? (
                <div className="file-info">
                  <span className="file-name">{imageFile.name}</span>
                  <span className="file-size">
                    {(imageFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImageFile();
                    }}
                    className="copy-button"
                    style={{ marginTop: "8px" }}
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <p className="drop-zone-text">
                  Arraste e solte uma imagem aqui, ou clique para selecionar
                </p>
              )}
            </div>
          )}
          
          {inputMode === "url" && (
            <div>
              <label htmlFor="url-input">
                URL (Ex: YouTube, artigo, etc.):
              </label>
              <input
                type="url"
                id="url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Cole o link de um vídeo, notícia ou página aqui..."
              />
            </div>
          )}
  
          {inputMode === "text" && (
            <div>
              <label htmlFor="main-text-instruction">
                Descrição da Ideia/Roteiro:
              </label>
              <textarea
                id="main-text-instruction"
                rows={4}
                value={mainTextInstruction}
                onChange={(e) => setMainTextInstruction(e.target.value)}
                placeholder="Ex: Um astronauta descobre um jardim secreto na lua..."
              />
            </div>
          )}
  
          <div className="settings-section">
            <label htmlFor="target-model">Modelo de Destino:</label>
            <select
              id="target-model"
              value={targetModel}
              onChange={(e) => setTargetModel(e.target.value)}
            >
              <option value="veo">VEO (Vídeo e Roteiro Estruturado)</option>
              <option value="geral">Geral (Prompt Estruturado)</option>
            </select>
          </div>
          <div>
            <label htmlFor="additional-instructions">
              Instruções Adicionais (opcional):
            </label>
            <textarea
              id="additional-instructions"
              rows={2}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Ex: Adicionar um tom de mistério, focar na expressão facial do personagem, etc."
            />
          </div>
  
          <div className="button-group">
            <button
              onClick={handleGeneratePrompt}
              className="generate-button"
              disabled={isLoading}
            >
              {isLoading ? <div className="loader" /> : null}
              {isLoading ? "Gerando..." : "Gerar Roteiro"}
            </button>
            <button
              onClick={handleGenerateConceptArt}
              className="generate-button secondary"
              disabled={isGeneratingConceptArt}
            >
              {isGeneratingConceptArt ? <div className="loader" /> : null}
              {isGeneratingConceptArt ? "Gerando..." : "Gerar Arte Conceitual"}
            </button>
          </div>
        </div>
  
        {error && <div className="error-message">{error}</div>}
  
        {isGeneratingConceptArt && (
          <div className="concept-art-section">
            <h2>Arte Conceitual</h2>
            <div className="gallery-item">
              <div className="image-skeleton-loader"></div>
              <div className="gallery-item-footer">
                <p
                  className="skeleton-line"
                  style={{ height: "2em", width: "80%" }}
                ></p>
              </div>
            </div>
          </div>
        )}
  
        {conceptArtError && (
          <div className="error-message">{conceptArtError}</div>
        )}
  
        {conceptArt && (
          <div className="concept-art-section">
            <h2>Arte Conceitual</h2>
            <div className="image-gallery">
              <div className="gallery-item">
                <img src={conceptArt.src} alt="Arte conceitual gerada" />
                <div className="gallery-item-footer">
                  <p className="gallery-item-prompt" title={conceptArt.prompt}>
                    Arte conceitual baseada na sua ideia.
                  </p>
                  <a
                    href={conceptArt.src}
                    download="arte_conceitual.jpg"
                    className="download-image-button"
                  >
                    Baixar
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
  
        {isLoading && (
          <div className="output-section">
            <div className="output-wrapper">
              <div className="script-container">
                <div className="output-header">
                  <label>Roteiro Gerado</label>
                </div>
                <div className="output-container">
                  <div className="skeleton-loader"></div>
                </div>
              </div>
            </div>
          </div>
        )}
  
        {generatedPrompt && (
          <div className="output-section">
            <div
              className={`output-wrapper ${showTwoColumns ? "two-columns" : ""}`}
            >
              <div className="script-container">
                <div className="output-header">
                  <label>Roteiro Gerado</label>
                  <div className="output-header-buttons">
                    {targetModel === "veo" && (
                      <button
                        className="generate-video-button"
                        onClick={() => handleGenerateFullVideo(generatedPrompt as VeoScript)}
                        disabled={isGeneratingVideo || isGeneratingAll}
                      >
                        Gerar Vídeo
                      </button>
                    )}
                    <button
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(generatedPrompt, null, 2),
                          "original"
                        )
                      }
                      className={`copy-button ${copied ? "copied" : ""}`}
                    >
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
                {generatedPromptSummary && (
                  <div className="script-summary-container">
                    <div className="summary-item">
                      <p>
                        <strong>EN:</strong> {generatedPromptSummary.en}
                      </p>
                      <button
                        onClick={() =>
                          copyToClipboard(generatedPromptSummary.en, "gen_en")
                        }
                        className={`copy-button summary-copy ${
                          copiedSummary === "gen_en" ? "copied" : ""
                        }`}
                      >
                        {copiedSummary === "gen_en" ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                    <div className="summary-item">
                      <p>
                        <strong>PT:</strong> {generatedPromptSummary.pt}
                      </p>
                      <button
                        onClick={() =>
                          copyToClipboard(generatedPromptSummary.pt, "gen_pt")
                        }
                        className={`copy-button summary-copy ${
                          copiedSummary === "gen_pt" ? "copied" : ""
                        }`}
                      >
                        {copiedSummary === "gen_pt" ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                  </div>
                )}
                <div className="output-container">
                  {renderScript(generatedPrompt)}
                </div>
              </div>
  
              {transformedPrompt && (
                <div className="script-container">
                  <div className="output-header">
                    <label>Roteiro Transformado</label>
                    <div className="output-header-buttons">
                      {targetModel === "veo" && (
                        <button
                          className="generate-video-button"
                          onClick={() =>
                            handleGenerateFullVideo(transformedPrompt as VeoScript)
                          }
                          disabled={isGeneratingVideo || isGeneratingAll}
                        >
                          Gerar Vídeo
                        </button>
                      )}
                      <button
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(transformedPrompt, null, 2),
                            "transformed"
                          )
                        }
                        className={`copy-button ${
                          transformedCopied ? "copied" : ""
                        }`}
                      >
                        {transformedCopied ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                  </div>
                  {transformedPromptSummary && (
                    <div className="script-summary-container">
                      <div className="summary-item">
                        <p>
                          <strong>EN:</strong> {transformedPromptSummary.en}
                        </p>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              transformedPromptSummary.en,
                              "trans_en"
                            )
                          }
                          className={`copy-button summary-copy ${
                            copiedSummary === "trans_en" ? "copied" : ""
                          }`}
                        >
                          {copiedSummary === "trans_en" ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                      <div className="summary-item">
                        <p>
                          <strong>PT:</strong> {transformedPromptSummary.pt}
                        </p>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              transformedPromptSummary.pt,
                              "trans_pt"
                            )
                          }
                          className={`copy-button summary-copy ${
                            copiedSummary === "trans_pt" ? "copied" : ""
                          }`}
                        >
                          {copiedSummary === "trans_pt" ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="output-container">
                    {renderScript(transformedPrompt)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
  
        {(generatedPrompt || transformedPrompt) && targetModel === "veo" && (
          <div className="transformation-section">
            <div className="output-header">
              <h2>Ferramentas de Roteiro (VEO)</h2>
            </div>
  
            <label htmlFor="transformation-instructions">
              Instruções para Transformar o Roteiro Gerado:
            </label>
            <textarea
              id="transformation-instructions"
              rows={3}
              value={transformationInstructions}
              onChange={(e) => setTransformationInstructions(e.target.value)}
              placeholder="Ex: Mude o tom para algo mais cômico, encurte todas as cenas em 2 segundos, adicione um novo personagem chamado 'Max'."
            />
            <button
              onClick={handleTransformPrompt}
              className="generate-button"
              disabled={isTransforming}
            >
              {isTransforming ? <div className="loader" /> : null}
              {isTransforming ? "Transformando..." : "Transformar Roteiro"}
            </button>
            {transformationError && (
              <div className="error-message">{transformationError}</div>
            )}
          </div>
        )}
  
        {currentScript && 'scenes' in currentScript && (
          <>
            <div className="image-gallery-section">
              <div className="output-header">
                <h2>Cenas do Roteiro</h2>
                <div className="output-header-buttons">
                  <button
                    className="generate-all-button"
                    onClick={() => handleGenerateAllNarrations(currentScript as VeoScript)}
                    disabled={isAnyActionInProgress}
                  >
                    {isGeneratingAllNarrations ? (
                      <div className="loader-small" />
                    ) : null}
                    {isGeneratingAllNarrations
                      ? "Gerando..."
                      : "Gerar Todas as Narrações"}
                  </button>
                  <button
                    className="generate-all-button"
                    onClick={() => handleGenerateAllImages(currentScript as VeoScript)}
                    disabled={isAnyActionInProgress}
                  >
                    {isGeneratingAll ? <div className="loader-small" /> : null}
                    {isGeneratingAll ? "Gerando..." : "Gerar Todas as Imagens"}
                  </button>
                </div>
              </div>
              {narrationError && (
                <div
                  className="error-message"
                  style={{ marginBottom: "16px" }}
                >
                  {narrationError}
                </div>
              )}
              <div className="scenes-wrapper">
                {(currentScript as VeoScript).scenes.map((scene, index) => (
                  <SceneCard
                    key={index}
                    scene={scene}
                    originalVisualPrompt={scene.visual_prompt_english}
                    onGenerateImage={() =>
                      handleGenerateImage(scene.visual_prompt_english)
                    }
                    isGeneratingThisImage={
                      isGeneratingImage === scene.visual_prompt_english
                    }
                    onGenerateNarration={handleGenerateNarration}
                    audioUrl={generatedAudios[scene.scene_number]}
                    isGeneratingThisNarration={
                      isGeneratingNarration === scene.scene_number
                    }
                    isAnyActionInProgress={isAnyActionInProgress}
                  />
                ))}
              </div>
            </div>
  
            <div className="coherence-section">
              <div className="output-header">
                <h2>Consistência Visual das Imagens</h2>
              </div>
              <p>
                Para manter a consistência entre as imagens (ex: mesmo
                personagem, mesmo estilo), forneça uma instrução de coerência.
              </p>
              <textarea
                id="image-coherence"
                rows={2}
                value={imageCoherence}
                onChange={(e) => setImageCoherence(e.target.value)}
                placeholder="Ex: a woman with red hair and a blue jacket, in a cyberpunk city, photographic style"
              />
            </div>
          </>
        )}
  
        {isGeneratingVideo && (
          <div className="video-gallery-section">
            <h2>Vídeos Gerados</h2>
            <div className="progress-indicator">
              <div className="loader" />
              <p>{videoGenerationProgress?.message || "Gerando vídeos..."}</p>
              {videoGenerationProgress && (
                <span>
                  Cena {videoGenerationProgress.current} de{" "}
                  {videoGenerationProgress.total}
                </span>
              )}
            </div>
          </div>
        )}
  
        {videoGenerationError && (
          <div className="error-message">{videoGenerationError}</div>
        )}
  
        {generatedVideos.length > 0 && currentScript && 'scenes' in currentScript && (
          <div className="video-gallery-section">
            <h2>Vídeos Gerados</h2>
            <div className="video-gallery">
              {[...Array(
                isGeneratingVideo
                  ? (currentScript as VeoScript).scenes.length
                  : generatedVideos.length
              )].map((_, index) => {
                const videoData = generatedVideos.find(
                  (v) => v.sceneNumber === (currentScript as VeoScript).scenes[index].scene_number
                );
                if (videoData) {
                  return (
                    <div className="video-item" key={videoData.sceneNumber}>
                      <video src={videoData.url} controls />
                      <div className="video-item-footer">
                        <h3 className="video-item-title">
                          Vídeo - Cena {videoData.sceneNumber}
                        </h3>
                        <a
                          href={videoData.url}
                          download={`video-cena-${videoData.sceneNumber}.mp4`}
                          className="download-video-button"
                        >
                          Baixar
                        </a>
                      </div>
                    </div>
                  );
                } else if (isGeneratingVideo) {
                  // Skeleton loader for videos being generated
                  return (
                    <div className="video-item" key={`skeleton-${index}`}>
                      <div className="video-skeleton-loader"></div>
                      <div className="video-item-footer">
                        <h3
                          className="video-item-title skeleton-line"
                          style={{ height: "1.2em", width: "60%" }}
                        ></h3>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
  
        {imageError && <div className="error-message">{imageError}</div>}
  
        {generatedImages.length > 0 && (
          <div className="image-gallery-section">
            <h2>Galeria de Imagens</h2>
            <div className="image-gallery">
              {generatedImages.map((image, index) => (
                <div className="gallery-item" key={index}>
                  <img
                    src={image.src}
                    alt={`Imagem gerada para: ${image.prompt}`}
                  />
                  <div className="gallery-item-footer">
                    <p className="gallery-item-prompt" title={image.prompt}>
                      {image.prompt}
                    </p>
                    <a
                      href={image.src}
                      download={`imagem_gerada_${index + 1}.jpg`}
                      className="download-image-button"
                    >
                      Baixar
                    </a>
                  </div>
                </div>
              ))}
              {(isGeneratingAll || isGeneratingImage) && (
                <div className="gallery-item">
                  <div className="image-skeleton-loader"></div>
                  <div className="gallery-item-footer">
                    <p
                      className="skeleton-line"
                      style={{ height: "2em", width: "80%" }}
                    ></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </>
      )}

      {mainTab === 'editing' && (
        <div className="editing-section">
          <div className="editing-input-group">
            <h3>1. Envie os Clipes de Vídeo</h3>
            <div
                className="drop-zone"
                onClick={() => editingVideoInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={editingVideoInputRef}
                  onChange={handleEditingVideoChange}
                  accept="video/*"
                  multiple
                  style={{ display: "none" }}
                />
                <p className="drop-zone-text">Arraste e solte os vídeos aqui, ou clique para selecionar</p>
            </div>
            {editingVideoFiles.length > 0 && (
              <div className="editing-file-list-container">
                <div className="editing-file-list">
                  {editingVideoFiles.map((file, index) => (
                    <div key={index} className="editing-file-list-item">
                      <span>{file.name}</span>
                      <button onClick={() => removeEditingVideo(index)}>&times;</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="editing-input-group">
            <h3>2. Envie o Arquivo de Áudio</h3>
             <div
                className="drop-zone"
                onClick={() => editingAudioInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={editingAudioInputRef}
                  onChange={handleEditingAudioChange}
                  accept="audio/*"
                  style={{ display: "none" }}
                />
                {editingAudioFile ? (
                   <div className="file-info">
                    <span className="file-name">{editingAudioFile.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEditingAudio();
                      }}
                      className="copy-button"
                      style={{ marginTop: "8px" }}
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <p className="drop-zone-text">Arraste e solte o áudio aqui, ou clique para selecionar</p>
                )}
            </div>
          </div>

          <div className="button-group">
            <button 
              onClick={handleMergeVideos} 
              className="generate-button"
              disabled={isMerging || editingVideoFiles.length === 0 || !editingAudioFile || !isFfmpegLoaded}>
              {isMerging ? <div className="loader" /> : null}
              {isMerging ? "Processando..." : "Juntar Vídeos e Áudio"}
            </button>
          </div>
          
          {isMerging && (
             <div className="ffmpeg-progress-container">
                <div className="preview-explanation">
                    <p><strong>Processando vídeo...</strong></p>
                    <p>O processamento pode levar vários minutos, dependendo do tamanho dos vídeos e da potência do seu computador. Por favor, não feche esta aba.</p>
                </div>
                <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${processingProgress}%` }}>
                        {processingProgress > 0 && `${processingProgress}%`}
                    </div>
                </div>
                <div className="ffmpeg-log">
                    {processingLog.map((msg, i) => <p key={i}>{msg}</p>)}
                </div>
            </div>
          )}

          {mergingError && <div className="error-message">{mergingError}</div>}
          
          {!isFfmpegLoaded && mainTab === 'editing' && !mergingError && (
              <div className="progress-indicator" style={{marginTop: '16px'}}>
                <div className="loader" />
                <p>Carregando editor de vídeo...</p>
              </div>
            )}

          {mergedVideoUrl && !isMerging && (
            <div className="merge-result-section">
              <h2>Resultado Final</h2>
               <div className="video-item" style={{width: '100%', maxWidth: '700px'}}>
                  <video src={mergedVideoUrl} controls />
                  <div className="video-item-footer">
                    <h3 className="video-item-title">
                      Vídeo Combinado
                    </h3>
                    <a
                      href={mergedVideoUrl}
                      download={`video_final.mp4`}
                      className="download-video-button"
                    >
                      Baixar Vídeo Final
                    </a>
                  </div>
                </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);