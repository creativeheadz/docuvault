import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getAssistantSettings, saveAssistantSettings, testAssistant } from '@/api/assistant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const OTHER = '__other__'

/** Which Claude the systems chat uses, with what key, how long a reply may be and at what effort. */
export function AssistantSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['assistant-settings'], queryFn: getAssistantSettings })
  const [model, setModel] = useState('')
  const [custom, setCustom] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [maxOut, setMaxOut] = useState(16000)
  const [effort, setEffort] = useState<string>('')

  useEffect(() => {
    if (!data) return
    const known = data.models.some((m) => m.id === data.model)
    setModel(known ? data.model : OTHER)
    setCustom(known ? '' : data.model)
    setMaxOut(data.max_output_tokens)
    setEffort(data.effort ?? '')
  }, [data])

  const chosen = model === OTHER ? custom.trim() : model
  const meta = data?.models.find((m) => m.id === chosen)

  const save = useMutation({
    mutationFn: (clearKey: boolean) => saveAssistantSettings({
      model: chosen,
      api_key: apiKey || undefined,
      clear_key: clearKey,
      max_output_tokens: maxOut,
      effort: effort || null,
    }),
    onSuccess: (d) => {
      queryClient.setQueryData(['assistant-settings'], d)
      setApiKey('')
      toast.success('Assistant settings saved')
    },
    onError: () => toast.error('Could not save the assistant settings'),
  })

  const test = useMutation({
    mutationFn: testAssistant,
    onSuccess: (r) => {
      if (r.ok) toast.success(`${r.model} answered in ${r.latency_ms} ms`)
      else toast.error(r.error || 'The test failed')
    },
    onError: () => toast.error('The test failed'),
  })

  if (!data) return null

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (chosen) save.mutate(false) }}
    >
      <p className="text-xs text-ink-dim leading-relaxed m-0">
        The assistant on every system's page, which searches MemPalace and drafts the record. Changing the model
        applies to the next message; earlier replies keep the cost of the model that wrote them.
      </p>

      <div className={model === OTHER ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
        <label className="block">
          <span className="label-micro">Model</span>
          <select className="input-field" value={model} onChange={(e) => setModel(e.target.value)}>
            {data.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label} · ${m.input} in / ${m.output} out per million tokens</option>
            ))}
            <option value={OTHER}>Another model ID…</option>
          </select>
          {meta && <span className="block mt-1.5 text-xxs font-mono text-ink-faint">{meta.note}</span>}
        </label>
        {model === OTHER && (
          <Input label="Model ID" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="claude-…" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="label-micro">Longest reply (output tokens)</span>
          <input
            type="number"
            className="input-field tnum"
            min={data.limits.min_output}
            max={data.limits.max_output}
            step={1000}
            value={maxOut}
            onChange={(e) => setMaxOut(Number(e.target.value))}
          />
          <span className="block mt-1.5 text-xxs font-mono text-ink-faint">
            A long write-up goes out in one reply; too low and it is cut off. {data.limits.min_output.toLocaleString()} to {data.limits.max_output.toLocaleString()}.
          </span>
        </label>
        <label className="block">
          <span className="label-micro">Effort</span>
          <select className="input-field" value={effort} onChange={(e) => setEffort(e.target.value)}>
            <option value="">The model's default</option>
            {data.efforts.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <span className="block mt-1.5 text-xxs font-mono text-ink-faint">How hard it thinks. Lower is quicker and cheaper.</span>
        </label>
      </div>

      <div>
        <Input
          label="Anthropic API key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={data.api_key_set ? 'Leave blank to keep the key in use' : 'sk-ant-…'}
        />
        <span className="block mt-1.5 text-xxs font-mono text-ink-faint">
          {data.api_key_source === 'settings' && 'Using the key saved here, stored encrypted.'}
          {data.api_key_source === 'environment' && 'Using ANTHROPIC_API_KEY from the server environment. A key saved here takes over from it.'}
          {!data.api_key_source && 'No key yet: the chat cannot run until one is saved here or set as ANTHROPIC_API_KEY.'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending} disabled={!chosen}>Save</Button>
        <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
          Test the saved settings
        </Button>
        {data.api_key_source === 'settings' && (
          <Button type="button" variant="ghost" onClick={() => save.mutate(true)}>Forget the saved key</Button>
        )}
      </div>
    </form>
  )
}
