import React, { useState } from 'react'
import { useQuery, useClient, isQueryLoading } from 'cozy-client'
import Typography from 'cozy-ui/transpiled/react/Typography'
import Card from 'cozy-ui/transpiled/react/Card'
import Box from 'cozy-ui/transpiled/react/Box'
import Button from 'cozy-ui/transpiled/react/Buttons'
import Spinner from 'cozy-ui/transpiled/react/Spinner'
import { getAllTranscriptions } from 'src/utils/queries'

/**
 * Transcription History Component
 * Displays saved transcriptions from Cozy
 */
const TranscriptionHistory = () => {
  const client = useClient()
  const { data: transcriptions, ...queryResult } = useQuery(
    getAllTranscriptions.definition,
    getAllTranscriptions.options
  )

  const [expandedId, setExpandedId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const handleToggleExpand = transcriptionId => {
    setExpandedId(expandedId === transcriptionId ? null : transcriptionId)
  }

  const handleCopy = async transcription => {
    try {
      await navigator.clipboard.writeText(transcription.text)
      setCopiedId(transcription._id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      // Silently fail - clipboard API may not be available
    }
  }

  const handleDelete = async transcription => {
    setDeletingId(transcription._id)
    await client.destroy(transcription)
    // Component will re-render with updated data
  }

  const formatDate = dateString => {
    const date = new Date(dateString)
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTruncatedText = (text, maxLength = 100) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  if (isQueryLoading(queryResult)) {
    return (
      <Box className="u-flex u-flex-justify-center u-p-2">
        <Spinner size="xxlarge" />
      </Box>
    )
  }

  if (!transcriptions || transcriptions.length === 0) {
    return (
      <Box className="u-ta-center u-p-2">
        <Typography variant="body2" color="textSecondary">
          Aucune transcription sauvegardée
        </Typography>
      </Box>
    )
  }

  // Sort by createdAt descending (most recent first)
  const sortedTranscriptions = [...transcriptions].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt)
  })

  return (
    <Box>
      {sortedTranscriptions.map(transcription => {
        const isExpanded = expandedId === transcription._id
        const isCopied = copiedId === transcription._id
        const isDeleting = deletingId === transcription._id

        return (
          <Card
            key={transcription._id}
            className="u-mb-1"
            style={{ opacity: isDeleting ? 0.5 : 1 }}
          >
            <Box className="u-p-1">
              {/* Header */}
              <Box
                className="u-flex u-flex-items-center u-flex-justify-between"
                style={{ marginBottom: '8px' }}
              >
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    {formatDate(transcription.createdAt)}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ marginLeft: '8px' }}
                  >
                    {transcription.language === 'fr' ? 'Français' : 'English'}
                  </Typography>
                </Box>
                <Box className="u-flex" style={{ gap: '4px' }}>
                  <Button
                    label={isCopied ? 'Copié !' : 'Copier'}
                    onClick={() => handleCopy(transcription)}
                    size="small"
                    theme={isCopied ? 'success' : 'text'}
                    disabled={isCopied || isDeleting}
                  />
                  <Button
                    label="Supprimer"
                    onClick={() => handleDelete(transcription)}
                    size="small"
                    theme="text"
                    busy={isDeleting}
                    disabled={isDeleting}
                  />
                </Box>
              </Box>

              {/* Text preview */}
              <Typography
                variant="body2"
                onClick={() => handleToggleExpand(transcription._id)}
                style={{
                  cursor: 'pointer',
                  whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                  overflow: 'hidden',
                  textOverflow: isExpanded ? 'clip' : 'ellipsis'
                }}
              >
                {isExpanded
                  ? transcription.text
                  : getTruncatedText(transcription.text)}
              </Typography>

              {/* Expand/collapse indicator */}
              {transcription.text.length > 100 && (
                <Button
                  label={isExpanded ? 'Voir moins' : 'Voir plus'}
                  onClick={() => handleToggleExpand(transcription._id)}
                  size="small"
                  theme="text"
                  className="u-mt-half"
                />
              )}
            </Box>
          </Card>
        )
      })}
    </Box>
  )
}

export default TranscriptionHistory
