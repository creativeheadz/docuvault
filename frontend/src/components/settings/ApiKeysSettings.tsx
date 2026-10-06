import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getApiTokens, createApiToken, revokeApiToken } from '@/api/api-tokens'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { CopyButton } from '@/components/ui/CopyButton'
import type { ApiTokenCreated } from '@/types'
import toast from 'react-hot-toast'

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : null
}

/**
 * What a key may do. Each scope is checked by exactly one router on the
 * server, which asks for it by name; a key holds the scopes it was minted
 * with and nothing widens them later. Neither reaches a stored password.
 */
const SCOPES: { id: string; label: string; detail: string }[] = [
  {
    id: 'read:context',
    label: 'Read documentation',
    detail: 'What an integration such as Wegweiser uses: organisations, devices, notes, runbooks.',
  },
  {
    id: 'write:tasks',
    label: 'Read and change tasks',
    detail: 'What an assistant keeping a roadmap here uses. Tasks only, nothing else in the vault.',
  },
]

/**
 * Keys that let another product read this documentation.
 *
 * The screen exists because the backend has always been able to mint these
 * and there was no way to do it without a shell — Wegweiser's own setup
 * wizard tells people to come to "Settings > API keys", which until now was
 * a page that did not exist.
 */
export function ApiKeysSettings() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', expires_in_days: '' })
  const [scopes, setScopes] = useState<string[]>(['read:context'])
  const [scopeToOrgs, setScopeToOrgs] = useState(false)
  const [orgIds, setOrgIds] = useState<string[]>([])
  const [justCreated, setJustCreated] = useState<ApiTokenCreated | null>(null)

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: getApiTokens,
  })

  const { data: orgs } = useQuery({
    queryKey: ['organizations', 'for-token-scope'],
    queryFn: () => getOrganizations({ page_size: 100 }),
    enabled: scopeToOrgs,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createApiToken({
        name: form.name.trim(),
        description: form.description.trim() || null,
        scopes,
        organization_ids: scopeToOrgs ? orgIds : [],
        expires_in_days: form.expires_in_days ? Number(form.expires_in_days) : null,
      }),
    onSuccess: (created) => {
      // Held in state deliberately: this is the only moment the plaintext
      // exists on the client, and re-fetching the list will not bring it back.
      setJustCreated(created)
      setCreating(false)
      setForm({ name: '', description: '', expires_in_days: '' })
      setScopes(['read:context'])
      setScopeToOrgs(false)
      setOrgIds([])
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: () => toast.error('Could not create the key'),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: () => {
      toast.success('Key revoked')
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: () => toast.error('Could not revoke the key'),
  })

  const live = (tokens ?? []).filter((t) => !t.revoked_at)
  const revoked = (tokens ?? []).filter((t) => t.revoked_at)

  return (
    <div className="space-y-3">
      {justCreated && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">Copy this key now</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                It is shown once. Only a hash is stored, so it cannot be shown
                again — a key that goes missing has to be replaced.
              </div>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 min-w-0 break-all text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 font-mono">
                  {justCreated.token}
                </code>
                <CopyButton value={justCreated.token} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setJustCreated(null)}
              >
                I have copied it
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
        <div className="text-xs text-gray-500 mb-3">
          Keys let another system use this instance without a person signing in.
          A key carries only the scopes it was minted with:{' '}
          <code className="font-mono">read:context</code> reads documentation for an
          integration, <code className="font-mono">write:tasks</code> reads and changes
          tasks. Neither can reach a stored password, whatever it is pointed at.
        </div>

        {isLoading && <div className="text-sm text-gray-500">Loading…</div>}

        {!isLoading && live.length === 0 && !creating && (
          <div className="text-sm text-gray-500">No keys yet.</div>
        )}

        {live.length > 0 && (
          <div className="space-y-2">
            {live.map((t) => {
              const expired = t.expires_at && new Date(t.expires_at) <= new Date()
              return (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 p-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      {t.name}
                      <code className="text-xs font-mono text-gray-500">{t.prefix}…</code>
                      {expired ? (
                        <Badge variant="default">Expired</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </div>
                    {t.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.scopes.map((s) => (
                        <code key={s} className="font-mono mr-1">
                          {s}
                        </code>
                      ))}
                      {' · '}
                      {t.organization_ids.length === 0
                        ? 'Every organisation'
                        : `${t.organization_ids.length} organisation${t.organization_ids.length === 1 ? '' : 's'}`}
                      {' · '}
                      {when(t.last_used_at) ? `last used ${when(t.last_used_at)}` : 'never used'}
                      {t.expires_at ? ` · expires ${when(t.expires_at)}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={revokeMutation.isPending && revokeMutation.variables === t.id}
                    onClick={() => revokeMutation.mutate(t.id)}
                  >
                    Revoke
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {!creating && (
          <Button size="sm" className="mt-3" onClick={() => setCreating(true)}>
            New key
          </Button>
        )}

        {creating && (
          <form
            className="space-y-3 mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              createMutation.mutate()
            }}
          >
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Wegweiser"
              required
            />
            <Input
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this key is for"
            />
            <Input
              label="Expires after (days, optional)"
              type="number"
              min={1}
              max={3650}
              value={form.expires_in_days}
              onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })}
              placeholder="Leave blank for no expiry"
            />

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium mb-1">What it may do</legend>
              {SCOPES.map((sc) => (
                <label key={sc.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(sc.id)}
                    onChange={(e) =>
                      setScopes((cur) =>
                        e.target.checked ? [...cur, sc.id] : cur.filter((x) => x !== sc.id),
                      )
                    }
                    className="rounded border-gray-300 mt-0.5"
                  />
                  <span>
                    {sc.label} <code className="font-mono text-xs text-gray-500">{sc.id}</code>
                    <span className="block text-xs text-gray-500">{sc.detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopeToOrgs}
                onChange={(e) => {
                  setScopeToOrgs(e.target.checked)
                  if (!e.target.checked) setOrgIds([])
                }}
                className="rounded border-gray-300 mt-0.5"
              />
              <span>
                Restrict to particular organisations
                <span className="block text-xs text-gray-500">
                  Otherwise the key covers every organisation. A restricted tasks key
                  also cannot see tasks that belong to no organisation.
                </span>
              </span>
            </label>

            {scopeToOrgs && (
              <div className="max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 p-2 space-y-1">
                {(orgs?.items ?? []).map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={orgIds.includes(o.id)}
                      onChange={(e) =>
                        setOrgIds((ids) =>
                          e.target.checked ? [...ids, o.id] : ids.filter((i) => i !== o.id),
                        )
                      }
                      className="rounded border-gray-300"
                    />
                    {o.name}
                  </label>
                ))}
                {orgs && orgs.items.length === 0 && (
                  <div className="text-xs text-gray-500">No organisations yet.</div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                loading={createMutation.isPending}
                disabled={
                  !form.name.trim() || scopes.length === 0 || (scopeToOrgs && orgIds.length === 0)
                }
              >
                Create key
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {revoked.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer">
              {revoked.length} revoked key{revoked.length === 1 ? '' : 's'}
            </summary>
            <div className="mt-2 space-y-1">
              {revoked.map((t) => (
                <div key={t.id} className="text-xs text-gray-500">
                  <span className="font-medium">{t.name}</span>{' '}
                  <code className="font-mono">{t.prefix}…</code> · revoked{' '}
                  {when(t.revoked_at)}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
