import { useState } from 'react'
import { Button, Spinner } from '@primer/react'
import { CheckCircleIcon } from '@primer/octicons-react'

interface ApproveAllWorkflowsButtonProps {
  runsByRepo: Record<string, number[]>
  onApproved: (runIds: number[]) => void
}

export function ApproveAllWorkflowsButton({ runsByRepo, onApproved }: ApproveAllWorkflowsButtonProps) {
  const [approving, setApproving] = useState(false)
  const total = Object.values(runsByRepo).reduce((count, runIds) => count + runIds.length, 0)

  if (total === 0) return null

  const handleApprove = async () => {
    setApproving(true)
    const approvedRunIds: number[] = []
    const failures: string[] = []
    try {
      for (const [repo, runIds] of Object.entries(runsByRepo)) {
        try {
          await window.repoAssist.approveWorkflowRuns(repo, runIds)
          approvedRunIds.push(...runIds)
        } catch (err) {
          failures.push(`${repo}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      onApproved(approvedRunIds)
      if (failures.length > 0) {
        await window.repoAssist.showMessageBox({
          type: 'error',
          message: 'Some workflow runs could not be approved',
          detail: failures.join('\n'),
          buttons: ['OK'],
        })
      }
    } finally {
      setApproving(false)
    }
  }

  return (
    <Button
      leadingVisual={approving ? Spinner : CheckCircleIcon}
      onClick={handleApprove}
      size="small"
      disabled={approving}
    >
      {approving ? 'Approving…' : `Approve all workflows (${total})`}
    </Button>
  )
}
