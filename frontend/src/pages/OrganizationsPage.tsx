import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { OrgList } from '@/components/organizations/OrgList'
import { OrgForm } from '@/components/organizations/OrgForm'
import { OrgDetail } from '@/components/organizations/OrgDetail'
import type { Organization } from '@/types'

export default function OrganizationsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editOrg, setEditOrg] = useState<Organization | null>(null)

  const handleAdd = () => { setEditOrg(null); setFormOpen(true) }
  const handleEdit = (org: Organization) => { setEditOrg(org); setFormOpen(true) }
  const handleClose = () => { setFormOpen(false); setEditOrg(null) }

  return (
    <>
      <Routes>
        <Route index element={<OrgList onAdd={handleAdd} />} />
        <Route path=":id" element={<OrgDetail onEdit={handleEdit} />} />
      </Routes>
      <OrgForm open={formOpen} onClose={handleClose} organization={editOrg} />
    </>
  )
}
