output "instance_id" {
  description = "ID of tfe-env instance"
  value       = aws_instance.tfe_env.id
}

output "fqdn" {
  description = "FQDN of tfe-env application"
  value       = aws_route53_record.tfe_env.fqdn
}

output "eip" {
  description = "Public IP address of tfe-env instance"
  value       = aws_eip.tfe_env.public_ip
}

output "ssh_command" {
  description = "SSH command to access instance"
  value       = "ssh ubuntu@${aws_route53_record.tfe_env.fqdn}"
}
