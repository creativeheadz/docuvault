import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getAssistantSettings, saveAssistantSettings, testAssistant } from '@/api/assistant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const OTHER = '__other__'

/** Which AI the systems chat uses, with what key, how long a reply may be and at what effort. */
export function AssistantSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['assistant-settings'], queryFn: getAssistantSettings })
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [custom, setCustom] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [maxOut, setMaxOut] = useState(16000)
  const [effort, setEffort] = useState<string>('')

  useEffect(() => {
    if (!data) return
    setProvider(data.provider)
    const known = data.models.some((m) => m.id === data.model)
    setModel(known ? data.model : OTHER)
    setCustom(known ? '' : data.model)
    setMaxOut(data.max_output_tokens)
    setEffort(data.effort ?? '')
  }, [data])

  const spec = data ? data.providers.find((p) => p.id === provider) ?? data.providers[0] : undefined
  const chosen = model === OTHER ? custom.trim() : model
  const meta = spec?.models.find((m) => m.id === chosen)
  const priceOf = (m: { input: number | null; output: number | null }) =>
    m.input == null || m.output == null ? '' : ` · $${m.input} in / $${m.output} out per million tokens`

  const save = useMutation({
    mutationFn: (clearKey: boolean) => saveAssistantSettings({
      provider: spec?.id ?? '',
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
    mutationFn: () => testAssistant({
      provider: spec?.id ?? '',
      model: chosen,
      api_key: apiKey || undefined,
      max_output_tokens: maxOut,
      effort: effort || null,
    }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`${r.model} answered in ${r.latency_ms} ms`)
      else toast.error(r.error || 'The test failed')
    },
    onError: () => toast.error('The test failed'),
  })

  if (!data || !spec) return null

  const switchProvider = (id: string) => {
    setProvider(id)
    // Each provider remembers its own saved model; until it is fetched the
    // dropdown seeds from the curated default, which save then keeps.
    const next = data.providers.find((p) => p.id === id)
    setModel(next ? next.default_model : OTHER)
    setCustom('')
    setApiKey('')
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (chosen) save.mutate(false) }}
    >
      <p className="text-xs text-ink-dim leading-relaxed m-0">
        The assistant on every system's page, which searches MemPalace and drafts the record. Each provider
        remembers its own model and key. Changing the model applies to the next message; earlier replies keep
        the cost of the model that wrote them.
      </p>

      <label className="block">
        <span className="label-micro">Provider</span>
        <select className="input-field" value={spec.id} onChange={(e) => switchProvider(e.target.value)}>
          {data.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="block mt-1.5 text-xxs font-mono text-ink-faint">{spec.note}</span>
      </label>

      <div className={model === OTHER ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
        <label className="block">
          <span className="label-micro">Model</span>
          <select className="input-field" value={spec.models.some((m) => m.id === model) ? model : OTHER} onChange={(e) => setModel(e.target.value)}>
            {spec.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}{priceOf(m)}</option>
            ))}
            <option value={OTHER}>Another model ID…</option>
          </select>
          {meta && <span className="block mt-1.5 text-xxs font-mono text-ink-faint">{meta.note}</span>}
        </label>
        {model === OTHER && (
          <Input label="Model ID" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={spec.default_model} />
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
          <span className="block mt-1.5 text-xxs font-mono text-ink-faint">
            {spec.api === 'anthropic'
              ? 'How hard it thinks. Lower is quicker and cheaper.'
              : 'Only Anthropic models use this; other providers ignore it.'}
          </span>
        </label>
      </div>

      <div>
        <Input
          label={spec.key_label}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={data.api_key_set ? 'Leave blank to keep the key in use' : spec.key_placeholder}
        />
        <span className="block mt-1.5 text-xxs font-mono text-ink-faint">
          {data.api_key_source === 'settings' && 'Using the key saved here, stored encrypted.'}
          {data.api_key_source === 'environment' && `Using ${spec.key_env} from the server environment. A key saved here takes over from it.`}
          {!data.api_key_source && `No key yet: the chat cannot run until one is saved here or set as ${spec.key_env} (${spec.key_help}).`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={save.isPending} disabled={!chosen}>Save</Button>
        <Button type="button" variant="secondary" loading={test.isPending} disabled={!chosen} onClick={() => test.mutate()}>
          Test these settings
        </Button>
        {data.api_key_source === 'settings' && (
          <Button type="button" variant="ghost" onClick={() => save.mutate(true)}>Forget the saved key</Button>
        )}
      </div>
    </form>
  )
}
