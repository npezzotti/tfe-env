locals {
  app = "tfe-env"
}

resource "aws_instance" "tfe_env" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.selected.id
  vpc_security_group_ids      = [aws_security_group.tfe_env.id]
  key_name                    = data.aws_key_pair.main.key_name
  associate_public_ip_address = true
  user_data_base64            = base64encode(file("${path.module}/scripts/user_data.sh"))
  iam_instance_profile        = aws_iam_instance_profile.tfe_env.name

  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = 50
    delete_on_termination = true
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = "${local.app}-instance"
  }

  lifecycle { ignore_changes = [ami] }
}

resource "aws_eip" "tfe_env" {
  domain = "vpc"
}

resource "aws_eip_association" "tfe_env" {
  allocation_id = aws_eip.tfe_env.id
  instance_id   = aws_instance.tfe_env.id
}

resource "aws_security_group" "tfe_env" {
  name        = "${local.app}-sg"
  description = "Allow inbound HTTP/HTTPS/SSH and all outbound traffic to tfe-env server."
  vpc_id      = data.aws_vpc.selected.id

  tags = {
    Name = "${local.app}-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "allow_https_ipv4" {
  security_group_id = aws_security_group.tfe_env.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  ip_protocol       = "tcp"
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "allow_http_ipv4" {
  security_group_id = aws_security_group.tfe_env.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  ip_protocol       = "tcp"
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "allow_ssh_ipv4" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = aws_security_group.tfe_env.id
  cidr_ipv4         = each.value
  from_port         = 22
  ip_protocol       = "tcp"
  to_port           = 22
}

resource "aws_vpc_security_group_egress_rule" "allow_all_traffic_ipv4" {
  security_group_id = aws_security_group.tfe_env.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_route53_record" "tfe_env" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = "tfe-env.${data.aws_route53_zone.selected.name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.tfe_env.public_ip]
}

resource "aws_cloudwatch_metric_alarm" "tfe_env" {
  alarm_name          = "${local.app}-stop"
  alarm_description   = "Stops tfe-env EC@ instance when CPU is below 5% for 1 continuous hour."
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:stop"]
  comparison_operator = "LessThanThreshold"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  statistic           = "Average"
  period              = 300
  threshold           = 5
  evaluation_periods  = 12
  datapoints_to_alarm = 12
  dimensions          = { InstanceId = aws_instance.tfe_env.id }
}
