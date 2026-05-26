// public/js/samples.js
//
// Three pre-loaded sample texts. Attached to window.RAID_SAMPLES so app.js
// can read them. Order matters: sample 0 is shown on page load.

(function attachSamples(window) {
  window.RAID_SAMPLES = [
    {
      name: 'Weekly status',
      text:
        'Project status: The vendor API integration is at risk because the ' +
        'supplier has not confirmed their delivery date and we think it is ' +
        'unlikely to land on time. We are assuming the finance team will sign ' +
        'off the budget by Friday. The staging environment is currently down, ' +
        'which is blocking all testing. We also need the data migration script ' +
        'from the platform team before we can go live.'
    },
    {
      name: 'Meeting transcript',
      text:
        'Quick update from the sync. Things are mostly fine but a few bits to ' +
        'flag. Sarah mentioned the new auth provider migration is going ok ' +
        'though honestly I\'m a bit worried we run out of runway before the ' +
        'contract renewal in March, it\'s tight. We\'ve been working on the ' +
        'assumption that the existing user data is clean but nobody\'s actually ' +
        'checked. Oh and the third-party payment gateway had an outage ' +
        'yesterday that knocked out checkout for two hours, that\'s sorted now ' +
        'but it spooked the client. Dev team are blocked waiting on the design ' +
        'system update from the UX folks, and separately the same UX team owe ' +
        'us the accessibility audit which is also holding up the compliance ' +
        'workstream. Budget\'s fine for now.'
    },
    {
      name: 'Email thread',
      text:
        'The server migration already failed once last week so there\'s a chance ' +
        'it could fail again on the next attempt. We\'re taking it as given that ' +
        'the rollback procedure works, we\'ve never had to use it in anger. The ' +
        'client keeps saying they "might" pull funding if the next demo goes ' +
        'badly, which would obviously end the project. Legal still haven\'t come ' +
        'back on the data processing agreement and we can\'t onboard the EU ' +
        'users until they do. Everyone keeps calling the slow database a ' +
        '"risk" but it\'s been slow for three weeks now and it\'s actively ' +
        'degrading the user experience today.'
    }
  ];
})(window);
