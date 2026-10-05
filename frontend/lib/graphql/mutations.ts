export const ACKNOWLEDGE_ALERT_MUTATION = `
  mutation AcknowledgeAlert($alertId: ID!, $notes: String) {
    acknowledgeAlert(alertId: $alertId, notes: $notes) {
      success
    }
  }
`;

export const LOG_INTERVENTION_MUTATION = `
  mutation LogIntervention(
    $alertId: ID!
    $feederId: String!
    $actionTaken: String!
    $notes: String
  ) {
    logIntervention(
      alertId: $alertId
      feederId: $feederId
      actionTaken: $actionTaken
      notes: $notes
    ) {
      success
    }
  }
`;
