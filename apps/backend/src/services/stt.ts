import { env } from '../env.js'

interface EnqueueResponse {
  job_id: string
  is_immediate: boolean
  status: string
  position: number | null
  eta_seconds: number | null
  duration_sec: number | null
  message: string
}

interface JobInfo {
  job_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  text: string | null
  error: string | null
}

interface TranscriptionResult {
  text: string
  duration: number
  segments?: Array<{
    speaker: string
    start: number
    end: number
    text: string
  }>
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 60

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<TranscriptionResult> {
  if (!env.STT_API_URL || !env.STT_API_KEY) {
    throw new Error('STT not configured')
  }

  // Build multipart form data
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), filename)

  // Submit transcription job
  const submitRes = await fetch(`${env.STT_API_URL}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STT_API_KEY}`,
    },
    body: formData,
  })

  if (!submitRes.ok) {
    const errBody = await submitRes.text().catch(() => '')
    throw new Error(`STT submit failed (${submitRes.status}): ${errBody}`)
  }

  const submitData = await submitRes.json() as EnqueueResponse | TranscriptionResult

  // If immediate result (200 with text)
  if ('text' in submitData && 'duration' in submitData) {
    return submitData as TranscriptionResult
  }

  // Lazy path — poll for result
  const enqueue = submitData as EnqueueResponse
  const jobId = enqueue.job_id

  const baseUrl = env.STT_API_URL.replace(/\/v1\/audio\/transcriptions$/, '')

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const statusRes = await fetch(`${baseUrl}/v1/audio/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${env.STT_API_KEY}` },
    })

    if (!statusRes.ok) {
      throw new Error(`STT poll failed (${statusRes.status})`)
    }

    const job = await statusRes.json() as JobInfo

    if (job.status === 'completed') {
      // text is directly in JobInfo, or fetch full result
      if (job.text) {
        return { text: job.text, duration: 0 }
      }

      const resultRes = await fetch(`${baseUrl}/v1/audio/jobs/${jobId}/result`, {
        headers: { 'Authorization': `Bearer ${env.STT_API_KEY}` },
      })

      if (!resultRes.ok) {
        throw new Error(`STT result fetch failed (${resultRes.status})`)
      }

      return await resultRes.json() as TranscriptionResult
    }

    if (job.status === 'failed') {
      throw new Error(`STT job failed: ${job.error ?? 'unknown error'}`)
    }

    // Still queued or processing — wait and retry
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error('STT job timed out')
}
