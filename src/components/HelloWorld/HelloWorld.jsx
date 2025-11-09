import React from 'react'
import Typography from 'cozy-ui/transpiled/react/Typography'
import Card from 'cozy-ui/transpiled/react/Card'
import Box from 'cozy-ui/transpiled/react/Box'

const HelloWorld = () => {
  return (
    <Box p={3} className="u-flex u-flex-justify-center u-flex-items-center" style={{ minHeight: '80vh' }}>
      <Card>
        <Box p={4} className="u-ta-center">
          <Typography variant="h1" gutterBottom>
            Hello World! 🎉
          </Typography>
          <Typography variant="h4" color="textSecondary">
            Bienvenue dans Twake Assistant
          </Typography>
          <Typography variant="body1" className="u-mt-1">
            Votre application Cozy fonctionne correctement !
          </Typography>
        </Box>
      </Card>
    </Box>
  )
}

export default HelloWorld
