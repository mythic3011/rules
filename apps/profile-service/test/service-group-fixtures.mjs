export function defaultServiceGroupLayout(data, outputFormat, baseProfile) {
  return data.serviceGroups
    .filter((group) => group.outputFormat === outputFormat && group.baseProfile === baseProfile)
    .map(({ id, name, serviceIds, defaultRoutes }) => ({
      id,
      name,
      serviceIds: [...serviceIds],
      routes: [...defaultRoutes],
    }));
}
