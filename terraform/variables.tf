variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "ID of VPC for tfe-env VM"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet in var.vpc_id for the tfe-env instance"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "m5.xlarge"
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs permitted for inbound SSH traffic"
  type        = list(string)

  # validation {
  #   condition = can(cidr)
  #   error_message = "Must be a valid CIDR range"
  # }
}

variable "key_name" {
  description = "Name of AWS key pair"
  type        = string
}

variable "route53_zone_name" {
  description = "AWS Route 53 zone in which to create tfe-env DNS record"
  type        = string
}
