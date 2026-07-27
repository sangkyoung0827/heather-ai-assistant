FROM searxng/searxng:2026.7.26-b060c780d
COPY settings.yml /etc/searxng/settings.yml.template
COPY entrypoint.sh /usr/local/bin/heather-searxng-entrypoint
RUN chmod 755 /usr/local/bin/heather-searxng-entrypoint
ENTRYPOINT ["/usr/local/bin/heather-searxng-entrypoint"]
